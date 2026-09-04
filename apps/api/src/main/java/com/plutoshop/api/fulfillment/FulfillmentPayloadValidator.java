package com.plutoshop.api.fulfillment;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Pattern;

public final class FulfillmentPayloadValidator {

    private static final int SUPPORTED_SCHEMA_VERSION = 1;
    private static final int MAX_EMAIL_LENGTH = 320;
    private static final int MAX_PASSWORD_LENGTH = 512;
    private static final int MAX_OPAQUE_VALUE_LENGTH = 2048;
    private static final int MAX_INVITE_URL_LENGTH = 2048;
    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    public FulfillmentPayload validate(
            FulfillmentType expectedType,
            int expectedSchemaVersion,
            FulfillmentPayload payload) {
        if (expectedType == null || payload == null || payload.type() != expectedType) {
            throw new FulfillmentPayloadValidationException("Fulfillment payload type is invalid");
        }
        if (expectedSchemaVersion != SUPPORTED_SCHEMA_VERSION
                || payload.schemaVersion() != SUPPORTED_SCHEMA_VERSION) {
            throw new FulfillmentPayloadValidationException("Fulfillment payload schema is unsupported");
        }
        if (!expectedType.requiresSecurePayload()) {
            throw new FulfillmentPayloadValidationException("Fulfillment payload type is invalid");
        }

        if (payload instanceof FulfillmentPayload.DiscordAccount discord) {
            validateDiscord(discord);
        } else if (payload instanceof FulfillmentPayload.LicenseKey license) {
            requireOpaque(
                    license.licenseKey(), "License key is required", "License key contains unsupported characters");
        } else if (payload instanceof FulfillmentPayload.InviteUrl invite) {
            validateInvite(invite);
        } else if (payload instanceof FulfillmentPayload.RedeemCode code) {
            requireOpaque(
                    code.code(), "Redeem code is required", "Redeem code contains unsupported characters");
        } else {
            throw new FulfillmentPayloadValidationException("Fulfillment payload type is invalid");
        }
        return payload;
    }

    private static void validateDiscord(FulfillmentPayload.DiscordAccount payload) {
        String email = payload.email();
        if (email == null || email.isBlank() || email.length() > MAX_EMAIL_LENGTH || !EMAIL.matcher(email).matches()) {
            throw new FulfillmentPayloadValidationException("Discord email is invalid");
        }
        requireOpaque(payload.password(), "Discord password is required", "Discord password contains unsupported characters",
                MAX_PASSWORD_LENGTH);
    }

    private static void validateInvite(FulfillmentPayload.InviteUrl payload) {
        String value = payload.inviteUrl();
        if (value == null || value.isBlank() || value.length() > MAX_INVITE_URL_LENGTH) {
            throw new FulfillmentPayloadValidationException("Invite URL is invalid");
        }
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme())) {
                throw new FulfillmentPayloadValidationException("Invite URL must use HTTPS");
            }
            if (uri.getHost() == null || uri.getHost().isBlank()) {
                throw new FulfillmentPayloadValidationException("Invite URL is invalid");
            }
        } catch (URISyntaxException exception) {
            throw new FulfillmentPayloadValidationException("Invite URL is invalid");
        }
        rejectControls(value, "Invite URL contains unsupported characters");
    }

    private static void requireOpaque(String value, String requiredMessage, String unsafeMessage) {
        requireOpaque(value, requiredMessage, unsafeMessage, MAX_OPAQUE_VALUE_LENGTH);
    }

    private static void requireOpaque(
            String value,
            String requiredMessage,
            String unsafeMessage,
            int maxLength) {
        if (value == null || value.isBlank()) {
            throw new FulfillmentPayloadValidationException(requiredMessage);
        }
        if (value.length() > maxLength) {
            throw new FulfillmentPayloadValidationException(unsafeMessage);
        }
        rejectControls(value, unsafeMessage);
    }

    private static void rejectControls(String value, String message) {
        for (int index = 0; index < value.length(); index++) {
            if (Character.isISOControl(value.charAt(index))) {
                throw new FulfillmentPayloadValidationException(message);
            }
        }
    }
}
