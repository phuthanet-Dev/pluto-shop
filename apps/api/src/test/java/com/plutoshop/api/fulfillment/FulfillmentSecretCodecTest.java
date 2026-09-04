package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Base64;

import tools.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class FulfillmentSecretCodecTest {

    private static final byte[] ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);
    private static final byte[] FINGERPRINT_KEY = "abcdef0123456789abcdef0123456789".getBytes(StandardCharsets.UTF_8);

    private final FulfillmentSecretCodec codec = new FulfillmentSecretCodec(
            ENCRYPTION_KEY,
            FINGERPRINT_KEY,
            1,
            new ObjectMapper());

    @Test
    void encryptsAndDecryptsCredentialPayloadWithoutPlaintextCiphertext() {
        FulfillmentPayload payload = new FulfillmentPayload.DiscordAccount(
                "synthetic@example.test",
                "synthetic-password");

        EncodedFulfillmentSecret encrypted = codec.encrypt(7L, 11L, "DISCORD", payload);

        assertThat(new String(encrypted.ciphertext(), StandardCharsets.UTF_8))
                .doesNotContain("synthetic@example.test")
                .doesNotContain("synthetic-password");
        assertThat(encrypted.nonce()).hasSize(12);
        assertThat(encrypted.fingerprint()).hasSize(32);
        assertThat(codec.decrypt(7L, 11L, "DISCORD", encrypted))
                .isInstanceOf(FulfillmentPayload.DiscordAccount.class)
                .extracting(value -> ((FulfillmentPayload.DiscordAccount) value).email())
                .isEqualTo("synthetic@example.test");
    }

    @Test
    void fingerprintIsStableWhileCiphertextUsesASeparateNonce() {
        FulfillmentPayload payload = new FulfillmentPayload.LicenseKey("LICENSE-123");

        EncodedFulfillmentSecret first = codec.encrypt(7L, 11L, "PROVIDER", payload);
        EncodedFulfillmentSecret second = codec.encrypt(7L, 12L, "PROVIDER", payload);

        assertThat(first.fingerprint()).isEqualTo(second.fingerprint());
        assertThat(first.nonce()).isNotEqualTo(second.nonce());
        assertThat(first.ciphertext()).isNotEqualTo(second.ciphertext());
    }

    @Test
    void tamperedCiphertextAndWrongContextAreRejected() {
        FulfillmentPayload payload = new FulfillmentPayload.InviteUrl("https://discord.gg/synthetic-token");
        EncodedFulfillmentSecret encrypted = codec.encrypt(7L, 11L, "DISCORD", payload);
        byte[] tamperedCiphertext = encrypted.ciphertext();
        tamperedCiphertext[0] ^= 1;
        EncodedFulfillmentSecret tampered = encrypted.withCiphertext(tamperedCiphertext);

        assertThatThrownBy(() -> codec.decrypt(7L, 11L, "DISCORD", tampered))
                .isInstanceOf(FulfillmentSecretException.class);
        assertThatThrownBy(() -> codec.decrypt(8L, 11L, "DISCORD", encrypted))
                .isInstanceOf(FulfillmentSecretException.class);
    }

    @Test
    void keyRingDecryptsOldVersionAndEncryptsWithCurrentVersion() {
        byte[] newEncryptionKey = "fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.UTF_8);
        FulfillmentSecretCodec oldCodec = new FulfillmentSecretCodec(
                ENCRYPTION_KEY, FINGERPRINT_KEY, 1, new ObjectMapper());
        FulfillmentSecretCodec rotatedCodec = new FulfillmentSecretCodec(
                Map.of(
                        1, new FulfillmentSecretCodec.KeyMaterial(ENCRYPTION_KEY, FINGERPRINT_KEY),
                        2, new FulfillmentSecretCodec.KeyMaterial(newEncryptionKey, FINGERPRINT_KEY)),
                2,
                new ObjectMapper());
        FulfillmentPayload payload = new FulfillmentPayload.LicenseKey("ROTATION-LICENSE");

        EncodedFulfillmentSecret oldEncrypted = oldCodec.encrypt(7L, 11L, "PROVIDER", payload);
        EncodedFulfillmentSecret newEncrypted = rotatedCodec.encrypt(7L, 12L, "PROVIDER", payload);

        assertThat(rotatedCodec.decrypt(7L, 11L, "PROVIDER", oldEncrypted))
                .isInstanceOf(FulfillmentPayload.LicenseKey.class)
                .extracting(value -> ((FulfillmentPayload.LicenseKey) value).licenseKey())
                .isEqualTo("ROTATION-LICENSE");
        assertThat(newEncrypted.encryptionKeyVersion()).isEqualTo(2);
        assertThat(rotatedCodec.decrypt(7L, 12L, "PROVIDER", newEncrypted))
                .isInstanceOf(FulfillmentPayload.LicenseKey.class)
                .extracting(value -> ((FulfillmentPayload.LicenseKey) value).licenseKey())
                .isEqualTo("ROTATION-LICENSE");
    }

    @Test
    void malformedEncodedFieldsFailAsSanitizedSecretErrors() {
        EncodedFulfillmentSecret invalid = new EncodedFulfillmentSecret(
                FulfillmentType.LICENSE_KEY,
                "PROVIDER",
                1,
                1,
                new byte[0],
                new byte[12],
                new byte[32]);

        assertThatThrownBy(() -> codec.decrypt(7L, 11L, "PROVIDER", invalid))
                .isInstanceOf(FulfillmentSecretException.class);
    }

    @Test
    void configurationBuildsVersionedKeyRingAndRejectsMismatchedVersions() {
        byte[] newEncryptionKey = "fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.UTF_8);
        String oldEncryption = Base64.getUrlEncoder().withoutPadding().encodeToString(ENCRYPTION_KEY);
        String oldFingerprint = Base64.getUrlEncoder().withoutPadding().encodeToString(FINGERPRINT_KEY);
        String currentEncryption = Base64.getUrlEncoder().withoutPadding().encodeToString(newEncryptionKey);
        FulfillmentSecretCodecConfiguration configuration = new FulfillmentSecretCodecConfiguration();

        FulfillmentSecretCodec codec = configuration.fulfillmentSecretCodec(
                new ObjectMapper(),
                "",
                "",
                2,
                "1:" + oldEncryption + ";2:" + currentEncryption,
                "1:" + oldFingerprint + ";2:" + oldFingerprint);

        FulfillmentSecretCodec oldCodec = new FulfillmentSecretCodec(
                ENCRYPTION_KEY, FINGERPRINT_KEY, 1, new ObjectMapper());
        EncodedFulfillmentSecret oldEncrypted = oldCodec.encrypt(
                7L, 11L, "PROVIDER", new FulfillmentPayload.LicenseKey("CONFIG-RING"));
        assertThat(codec.decrypt(7L, 11L, "PROVIDER", oldEncrypted))
                .isInstanceOf(FulfillmentPayload.LicenseKey.class);

        assertThatThrownBy(() -> configuration.fulfillmentSecretCodec(
                new ObjectMapper(), "", "", 2,
                "1:" + oldEncryption,
                "1:" + oldFingerprint))
                .isInstanceOf(FulfillmentSecretConfigurationException.class);
    }

    @Test
    void rejectsFingerprintKeyChangesAcrossEncryptionKeyVersions() {
        byte[] newEncryptionKey = "fedcba9876543210fedcba9876543210".getBytes(StandardCharsets.UTF_8);
        byte[] differentFingerprintKey = "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> new FulfillmentSecretCodec(
                Map.of(
                        1, new FulfillmentSecretCodec.KeyMaterial(ENCRYPTION_KEY, FINGERPRINT_KEY),
                        2, new FulfillmentSecretCodec.KeyMaterial(newEncryptionKey, differentFingerprintKey)),
                2,
                new ObjectMapper()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Fulfillment fingerprint key must remain stable across versions");
    }
}
