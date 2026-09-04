package com.plutoshop.api.fulfillment;

public sealed interface FulfillmentPayload
        permits FulfillmentPayload.DiscordAccount,
                FulfillmentPayload.LicenseKey,
                FulfillmentPayload.InviteUrl,
                FulfillmentPayload.RedeemCode {

    FulfillmentType type();

    int schemaVersion();

    /**
     * Canonical secret material used only by the server-side blind fingerprint.
     * Implementations must never expose this value from toString or API DTOs.
     */
    String fingerprintMaterial();

    final class DiscordAccount implements FulfillmentPayload {
        private final String email;
        private final String password;

        public DiscordAccount(String email, String password) {
            this.email = email;
            this.password = password;
        }

        public String email() {
            return email;
        }

        public String password() {
            return password;
        }

        @Override
        public FulfillmentType type() {
            return FulfillmentType.DISCORD_ACCOUNT;
        }

        @Override
        public int schemaVersion() {
            return 1;
        }

        @Override
        public String fingerprintMaterial() {
            return "email\u0000" + email;
        }

        @Override
        public String toString() {
            return "DiscordAccount[email=<redacted>, password=<redacted>]";
        }
    }

    final class LicenseKey implements FulfillmentPayload {
        private final String licenseKey;

        public LicenseKey(String licenseKey) {
            this.licenseKey = licenseKey;
        }

        public String licenseKey() {
            return licenseKey;
        }

        @Override
        public FulfillmentType type() {
            return FulfillmentType.LICENSE_KEY;
        }

        @Override
        public int schemaVersion() {
            return 1;
        }

        @Override
        public String fingerprintMaterial() {
            return "license\u0000" + licenseKey;
        }

        @Override
        public String toString() {
            return "LicenseKey[licenseKey=<redacted>]";
        }
    }

    final class InviteUrl implements FulfillmentPayload {
        private final String inviteUrl;

        public InviteUrl(String inviteUrl) {
            this.inviteUrl = inviteUrl;
        }

        public String inviteUrl() {
            return inviteUrl;
        }

        @Override
        public FulfillmentType type() {
            return FulfillmentType.INVITE_URL;
        }

        @Override
        public int schemaVersion() {
            return 1;
        }

        @Override
        public String fingerprintMaterial() {
            return "invite\u0000" + inviteUrl;
        }

        @Override
        public String toString() {
            return "InviteUrl[inviteUrl=<redacted>]";
        }
    }

    final class RedeemCode implements FulfillmentPayload {
        private final String code;

        public RedeemCode(String code) {
            this.code = code;
        }

        public String code() {
            return code;
        }

        @Override
        public FulfillmentType type() {
            return FulfillmentType.REDEEM_CODE;
        }

        @Override
        public int schemaVersion() {
            return 1;
        }

        @Override
        public String fingerprintMaterial() {
            return "code\u0000" + code;
        }

        @Override
        public String toString() {
            return "RedeemCode[code=<redacted>]";
        }
    }
}
