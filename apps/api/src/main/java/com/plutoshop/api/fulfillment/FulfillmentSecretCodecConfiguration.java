package com.plutoshop.api.fulfillment;

import java.util.Arrays;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
public class FulfillmentSecretCodecConfiguration {

    @Bean
    FulfillmentSecretCodec fulfillmentSecretCodec(
            ObjectMapper objectMapper,
            @Value("${fulfillment.security.encryption-key-base64:}") String encryptionKeyBase64,
            @Value("${fulfillment.security.fingerprint-key-base64:}") String fingerprintKeyBase64,
            @Value("${fulfillment.security.key-version:1}") int keyVersion,
            @Value("${fulfillment.security.encryption-key-ring:}") String encryptionKeyRing,
            @Value("${fulfillment.security.fingerprint-key-ring:}") String fingerprintKeyRing) {
        if ((encryptionKeyBase64 == null || encryptionKeyBase64.isBlank())
                && (encryptionKeyRing == null || encryptionKeyRing.isBlank())
                || (fingerprintKeyBase64 == null || fingerprintKeyBase64.isBlank())
                && (fingerprintKeyRing == null || fingerprintKeyRing.isBlank())) {
            return FulfillmentSecretCodec.disabled(objectMapper);
        }
        try {
            Map<Integer, byte[]> encryptionKeys = parseRing(encryptionKeyRing, "encryption");
            Map<Integer, byte[]> fingerprintKeys = parseRing(fingerprintKeyRing, "fingerprint");
            addCurrentKey(encryptionKeys, keyVersion, encryptionKeyBase64, "encryption");
            addCurrentKey(fingerprintKeys, keyVersion, fingerprintKeyBase64, "fingerprint");
            if (!encryptionKeys.keySet().equals(fingerprintKeys.keySet())) {
                throw new FulfillmentSecretConfigurationException("Fulfillment key versions do not match");
            }
            Map<Integer, FulfillmentSecretCodec.KeyMaterial> keys = new HashMap<>();
            for (Integer version : encryptionKeys.keySet()) {
                keys.put(version, new FulfillmentSecretCodec.KeyMaterial(
                        encryptionKeys.get(version), fingerprintKeys.get(version)));
            }
            return new FulfillmentSecretCodec(keys, keyVersion, objectMapper);
        } catch (FulfillmentSecretConfigurationException exception) {
            throw exception;
        } catch (IllegalArgumentException exception) {
            throw new FulfillmentSecretConfigurationException(
                    "Fulfillment encryption configuration is invalid");
        }
    }

    private static Map<Integer, byte[]> parseRing(String ring, String kind) {
        Map<Integer, byte[]> keys = new HashMap<>();
        if (ring == null || ring.isBlank()) {
            return keys;
        }
        for (String entry : ring.split(";", -1)) {
            String normalized = entry.trim();
            int separator = normalized.indexOf(':');
            if (separator <= 0 || separator == normalized.length() - 1
                    || separator != normalized.lastIndexOf(':')) {
                throw new IllegalArgumentException("Invalid fulfillment " + kind + " key ring");
            }
            int version = Integer.parseInt(normalized.substring(0, separator));
            if (version < 1 || keys.containsKey(version)) {
                throw new IllegalArgumentException("Invalid fulfillment key version");
            }
            keys.put(version, Base64.getUrlDecoder().decode(normalized.substring(separator + 1).trim()));
        }
        return keys;
    }

    private static void addCurrentKey(Map<Integer, byte[]> keys, int version, String encoded, String kind) {
        if (encoded == null || encoded.isBlank()) {
            return;
        }
        byte[] decoded = Base64.getUrlDecoder().decode(encoded.trim());
        byte[] existing = keys.putIfAbsent(version, decoded);
        if (existing != null && !Arrays.equals(existing, decoded)) {
            throw new IllegalArgumentException("Conflicting fulfillment " + kind + " key version");
        }
    }
}
