package com.plutoshop.api.fulfillment;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

public final class FulfillmentSecretCodec {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_NONCE_BYTES = 12;
    private static final int FINGERPRINT_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Map<Integer, KeyMaterial> keys;
    private final int currentKeyVersion;
    private final ObjectMapper objectMapper;
    private final FulfillmentPayloadValidator validator;
    private final boolean configured;

    public FulfillmentSecretCodec(
            byte[] encryptionKey,
            byte[] fingerprintKey,
            int currentKeyVersion,
            ObjectMapper objectMapper) {
        this(
                Map.of(currentKeyVersion, new KeyMaterial(encryptionKey, fingerprintKey)),
                currentKeyVersion,
                objectMapper);
    }

    public FulfillmentSecretCodec(
            Map<Integer, KeyMaterial> keys,
            int currentKeyVersion,
            ObjectMapper objectMapper) {
        this(keys, currentKeyVersion, objectMapper, true);
    }

    private FulfillmentSecretCodec(
            Map<Integer, KeyMaterial> keys,
            int currentKeyVersion,
            ObjectMapper objectMapper,
            boolean configured) {
        if (configured && (keys == null || keys.isEmpty() || !keys.containsKey(currentKeyVersion))) {
            throw new IllegalArgumentException("At least the current fulfillment key is required");
        }
        if (configured && currentKeyVersion < 1) {
            throw new IllegalArgumentException("Fulfillment key version must be positive");
        }
        this.keys = configured ? Map.copyOf(new HashMap<>(keys)) : Map.of();
        this.currentKeyVersion = currentKeyVersion;
        this.objectMapper = Objects.requireNonNull(objectMapper, "objectMapper");
        this.validator = new FulfillmentPayloadValidator();
        this.configured = configured;
    }

    static FulfillmentSecretCodec disabled(ObjectMapper objectMapper) {
        return new FulfillmentSecretCodec(Map.of(), 0, objectMapper, false);
    }

    public EncodedFulfillmentSecret encrypt(
            long productId,
            long inventoryItemId,
            String provider,
            FulfillmentPayload payload) {
        ensureConfigured();
        validateContext(productId, inventoryItemId, provider);
        validator.validate(payload == null ? null : payload.type(),
                payload == null ? -1 : payload.schemaVersion(), payload);

        KeyMaterial keyMaterial = keys.get(currentKeyVersion);
        byte[] nonce = new byte[GCM_NONCE_BYTES];
        RANDOM.nextBytes(nonce);
        byte[] plaintext = serialize(payload);
        try {
            byte[] ciphertext;
            try {
                ciphertext = crypt(Cipher.ENCRYPT_MODE, productId, inventoryItemId, provider,
                        payload.type(), payload.schemaVersion(), currentKeyVersion, nonce, plaintext,
                        keyMaterial.encryptionKey());
            } catch (GeneralSecurityException exception) {
                throw new FulfillmentSecretException("Fulfillment secret could not be encrypted", exception);
            }
            byte[] fingerprint = fingerprint(provider, payload, keyMaterial.fingerprintKey());
            return new EncodedFulfillmentSecret(
                    payload.type(),
                    provider,
                    payload.schemaVersion(),
                    currentKeyVersion,
                    ciphertext,
                    nonce,
                    fingerprint);
        } finally {
            java.util.Arrays.fill(plaintext, (byte) 0);
        }
    }

    public FulfillmentPayload decrypt(
            long productId,
            long inventoryItemId,
            String provider,
            EncodedFulfillmentSecret encrypted) {
        ensureConfigured();
        validateContext(productId, inventoryItemId, provider);
        if (encrypted == null
                || encrypted.type() == null
                || !encrypted.type().requiresSecurePayload()
                || !provider.equals(encrypted.provider())
                || encrypted.encryptionKeyVersion() < 1
                || encrypted.ciphertext() == null
                || encrypted.nonce() == null
                || encrypted.fingerprint() == null
                || encrypted.nonce().length != GCM_NONCE_BYTES
                || encrypted.fingerprint().length != FINGERPRINT_BYTES) {
            throw new FulfillmentSecretException("Fulfillment secret is invalid");
        }

        KeyMaterial keyMaterial = keys.get(encrypted.encryptionKeyVersion());
        if (keyMaterial == null) {
            throw new FulfillmentSecretException("Fulfillment encryption key version is unavailable");
        }

        byte[] plaintext;
        try {
            plaintext = crypt(
                    Cipher.DECRYPT_MODE,
                    productId,
                    inventoryItemId,
                    provider,
                    encrypted.type(),
                    encrypted.schemaVersion(),
                    encrypted.encryptionKeyVersion(),
                    encrypted.nonce(),
                    encrypted.ciphertext(),
                    keyMaterial.encryptionKey());
        } catch (GeneralSecurityException | RuntimeException exception) {
            throw new FulfillmentSecretException("Fulfillment secret could not be decrypted", exception);
        }

        try {
            FulfillmentPayload payload = deserialize(plaintext, encrypted.type(), encrypted.schemaVersion());
            byte[] expectedFingerprint = fingerprint(provider, payload, keyMaterial.fingerprintKey());
            if (!MessageDigest.isEqual(expectedFingerprint, encrypted.fingerprint())) {
                throw new FulfillmentSecretException("Fulfillment secret fingerprint is invalid");
            }
            return payload;
        } finally {
            java.util.Arrays.fill(plaintext, (byte) 0);
        }
    }

    public static final class KeyMaterial {
        private final byte[] encryptionKey;
        private final byte[] fingerprintKey;

        public KeyMaterial(byte[] encryptionKey, byte[] fingerprintKey) {
            validateKey(encryptionKey, "encryption");
            validateKey(fingerprintKey, "fingerprint");
            this.encryptionKey = encryptionKey.clone();
            this.fingerprintKey = fingerprintKey.clone();
        }

        byte[] encryptionKey() {
            return encryptionKey.clone();
        }

        byte[] fingerprintKey() {
            return fingerprintKey.clone();
        }

        @Override
        public String toString() {
            return "KeyMaterial[encryptionKey=<redacted>, fingerprintKey=<redacted>]";
        }
    }

    private byte[] serialize(FulfillmentPayload payload) {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("schemaVersion", payload.schemaVersion());
        root.put("type", payload.type().name());
        ObjectNode data = root.putObject("data");
        if (payload instanceof FulfillmentPayload.DiscordAccount discord) {
            data.put("email", discord.email());
            data.put("password", discord.password());
        } else if (payload instanceof FulfillmentPayload.LicenseKey license) {
            data.put("licenseKey", license.licenseKey());
        } else if (payload instanceof FulfillmentPayload.InviteUrl invite) {
            data.put("inviteUrl", invite.inviteUrl());
        } else if (payload instanceof FulfillmentPayload.RedeemCode code) {
            data.put("code", code.code());
        } else {
            throw new FulfillmentSecretException("Fulfillment payload type is invalid");
        }
        try {
            return objectMapper.writeValueAsBytes(root);
        } catch (Exception exception) {
            throw new FulfillmentSecretException("Fulfillment secret could not be serialized", exception);
        }
    }

    private FulfillmentPayload deserialize(
            byte[] plaintext,
            FulfillmentType expectedType,
            int expectedSchemaVersion) {
        try {
            JsonNode root = objectMapper.readTree(plaintext);
            if (root == null || !root.isObject()
                    || root.path("schemaVersion").asInt(-1) != expectedSchemaVersion
                    || !expectedType.name().equals(root.path("type").asString(null))) {
                throw new FulfillmentSecretException("Fulfillment secret payload is invalid");
            }
            JsonNode dataNode = root.get("data");
            if (dataNode == null || !dataNode.isObject()) {
                throw new FulfillmentSecretException("Fulfillment secret payload is invalid");
            }
            ObjectNode data = (ObjectNode) dataNode;
            FulfillmentPayload payload = switch (expectedType) {
                case DISCORD_ACCOUNT -> {
                    requireExactFields(data, Set.of("email", "password"));
                    yield new FulfillmentPayload.DiscordAccount(
                            requiredText(data, "email"), requiredText(data, "password"));
                }
                case LICENSE_KEY -> {
                    requireExactFields(data, Set.of("licenseKey"));
                    yield new FulfillmentPayload.LicenseKey(requiredText(data, "licenseKey"));
                }
                case INVITE_URL -> {
                    requireExactFields(data, Set.of("inviteUrl"));
                    yield new FulfillmentPayload.InviteUrl(requiredText(data, "inviteUrl"));
                }
                case REDEEM_CODE -> {
                    requireExactFields(data, Set.of("code"));
                    yield new FulfillmentPayload.RedeemCode(requiredText(data, "code"));
                }
                case NONE, MANUAL_INSTRUCTION -> throw new FulfillmentSecretException(
                        "Fulfillment secret payload type is invalid");
            };
            return validator.validate(expectedType, expectedSchemaVersion, payload);
        } catch (FulfillmentSecretException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new FulfillmentSecretException("Fulfillment secret payload is invalid", exception);
        }
    }

    private static void requireExactFields(ObjectNode data, Set<String> fields) {
        if (data.size() != fields.size()) {
            throw new FulfillmentSecretException("Fulfillment secret payload is invalid");
        }
        for (String field : fields) {
            JsonNode node = data.get(field);
            if (node == null || !node.isTextual()) {
                throw new FulfillmentSecretException("Fulfillment secret payload is invalid");
            }
        }
    }

    private static String requiredText(ObjectNode data, String field) {
        return data.get(field).asString();
    }

    private static byte[] crypt(
            int mode,
            long productId,
            long inventoryItemId,
            String provider,
            FulfillmentType type,
            int schemaVersion,
            int keyVersion,
            byte[] nonce,
            byte[] input,
            byte[] encryptionKey) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, new SecretKeySpec(encryptionKey, "AES"), new GCMParameterSpec(GCM_TAG_BITS, nonce));
        cipher.updateAAD(aad(productId, inventoryItemId, provider, type, schemaVersion, keyVersion));
        return cipher.doFinal(input);
    }

    private static byte[] fingerprint(String provider, FulfillmentPayload payload, byte[] fingerprintKey) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(fingerprintKey, "HmacSHA256"));
            return mac.doFinal((payload.type().name() + "\u0000" + provider + "\u0000"
                    + payload.schemaVersion() + "\u0000" + payload.fingerprintMaterial())
                    .getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException exception) {
            throw new FulfillmentSecretException("Fulfillment fingerprint could not be created", exception);
        }
    }

    private static byte[] aad(
            long productId,
            long inventoryItemId,
            String provider,
            FulfillmentType type,
            int schemaVersion,
            int keyVersion) {
        return ("plutoshop-fulfillment-v1\u0000product=" + productId
                + "\u0000inventory=" + inventoryItemId
                + "\u0000provider=" + provider
                + "\u0000type=" + type.name()
                + "\u0000schema=" + schemaVersion
                + "\u0000key=" + keyVersion).getBytes(StandardCharsets.UTF_8);
    }

    private static void validateContext(long productId, long inventoryItemId, String provider) {
        if (productId < 1 || inventoryItemId < 1 || provider == null || provider.isBlank()
                || provider.length() > 64 || !provider.equals(provider.trim())) {
            throw new FulfillmentSecretException("Fulfillment secret context is invalid");
        }
        for (int index = 0; index < provider.length(); index++) {
            if (Character.isISOControl(provider.charAt(index))) {
                throw new FulfillmentSecretException("Fulfillment secret context is invalid");
            }
        }
    }

    private void ensureConfigured() {
        if (!configured) {
            throw new FulfillmentSecretConfigurationException("Fulfillment encryption is not configured");
        }
    }

    private static void validateKey(byte[] key, String kind) {
        if (key == null || (kind.equals("encryption") && key.length != 32)
                || (kind.equals("fingerprint") && key.length < 32)) {
            throw new IllegalArgumentException("Fulfillment " + kind + " key has an invalid length");
        }
    }
}
