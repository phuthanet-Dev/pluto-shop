package com.plutoshop.api.fulfillment;

import java.util.Arrays;

final class EncodedFulfillmentSecret {

    private final FulfillmentType type;
    private final String provider;
    private final int schemaVersion;
    private final int encryptionKeyVersion;
    private final byte[] ciphertext;
    private final byte[] nonce;
    private final byte[] fingerprint;

    EncodedFulfillmentSecret(
            FulfillmentType type,
            String provider,
            int schemaVersion,
            int encryptionKeyVersion,
            byte[] ciphertext,
            byte[] nonce,
            byte[] fingerprint) {
        this.type = type;
        this.provider = provider;
        this.schemaVersion = schemaVersion;
        this.encryptionKeyVersion = encryptionKeyVersion;
        this.ciphertext = ciphertext.clone();
        this.nonce = nonce.clone();
        this.fingerprint = fingerprint.clone();
    }

    FulfillmentType type() {
        return type;
    }

    String provider() {
        return provider;
    }

    int schemaVersion() {
        return schemaVersion;
    }

    int encryptionKeyVersion() {
        return encryptionKeyVersion;
    }

    byte[] ciphertext() {
        return ciphertext.clone();
    }

    byte[] nonce() {
        return nonce.clone();
    }

    byte[] fingerprint() {
        return fingerprint.clone();
    }

    EncodedFulfillmentSecret withCiphertext(byte[] replacement) {
        return new EncodedFulfillmentSecret(
                type,
                provider,
                schemaVersion,
                encryptionKeyVersion,
                replacement,
                nonce,
                fingerprint);
    }

    @Override
    public String toString() {
        return "EncodedFulfillmentSecret[type=" + type
                + ", provider=" + provider
                + ", schemaVersion=" + schemaVersion
                + ", encryptionKeyVersion=" + encryptionKeyVersion
                + ", ciphertextBytes=" + ciphertext.length
                + ", nonceBytes=" + nonce.length
                + ", fingerprintBytes=" + fingerprint.length
                + "]";
    }
}
