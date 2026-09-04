package com.plutoshop.api.fulfillment;

public enum FulfillmentType {
    NONE,
    DISCORD_ACCOUNT,
    LICENSE_KEY,
    INVITE_URL,
    REDEEM_CODE,
    MANUAL_INSTRUCTION;

    public boolean requiresSecurePayload() {
        return switch (this) {
            case DISCORD_ACCOUNT, LICENSE_KEY, INVITE_URL, REDEEM_CODE -> true;
            case NONE, MANUAL_INSTRUCTION -> false;
        };
    }
}
