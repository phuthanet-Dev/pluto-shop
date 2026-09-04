package com.plutoshop.api.fulfillment;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class FulfillmentPayloadFactory {

    private final FulfillmentPayloadValidator validator;

    public FulfillmentPayloadFactory(FulfillmentPayloadValidator validator) {
        this.validator = validator;
    }

    public FulfillmentPayload fromFields(FulfillmentType type, Map<String, String> fields) {
        if (type == null || fields == null) {
            throw new FulfillmentPayloadValidationException("Fulfillment payload is invalid");
        }
        FulfillmentPayload payload = switch (type) {
            case DISCORD_ACCOUNT -> {
                requireExactFields(fields, "email", "password");
                yield new FulfillmentPayload.DiscordAccount(fields.get("email"), fields.get("password"));
            }
            case LICENSE_KEY -> {
                requireExactFields(fields, "licenseKey");
                yield new FulfillmentPayload.LicenseKey(fields.get("licenseKey"));
            }
            case INVITE_URL -> {
                requireExactFields(fields, "inviteUrl");
                yield new FulfillmentPayload.InviteUrl(fields.get("inviteUrl"));
            }
            case REDEEM_CODE -> {
                requireExactFields(fields, "code");
                yield new FulfillmentPayload.RedeemCode(fields.get("code"));
            }
            case NONE, MANUAL_INSTRUCTION -> throw new FulfillmentPayloadValidationException(
                    "Fulfillment payload type is invalid");
        };
        return validator.validate(type, 1, payload);
    }

    Map<String, String> toFields(FulfillmentPayload payload) {
        if (payload instanceof FulfillmentPayload.DiscordAccount discord) {
            return Map.of("email", discord.email(), "password", discord.password());
        }
        if (payload instanceof FulfillmentPayload.LicenseKey license) {
            return Map.of("licenseKey", license.licenseKey());
        }
        if (payload instanceof FulfillmentPayload.InviteUrl invite) {
            return Map.of("inviteUrl", invite.inviteUrl());
        }
        if (payload instanceof FulfillmentPayload.RedeemCode code) {
            return Map.of("code", code.code());
        }
        throw new FulfillmentPayloadValidationException("Fulfillment payload type is invalid");
    }

    private static void requireExactFields(Map<String, String> fields, String... names) {
        Set<String> expected = new HashSet<>(Arrays.asList(names));
        if (fields.size() != expected.size() || !fields.keySet().equals(expected)) {
            throw new FulfillmentPayloadValidationException("Fulfillment payload fields are invalid");
        }
    }
}
