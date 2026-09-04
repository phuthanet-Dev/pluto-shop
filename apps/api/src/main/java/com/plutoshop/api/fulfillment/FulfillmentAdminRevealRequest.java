package com.plutoshop.api.fulfillment;

import java.util.Locale;
import java.util.Set;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record FulfillmentAdminRevealRequest(
        @NotBlank
        @Size(max = 32)
        @Pattern(regexp = "[A-Z_]{3,32}")
        String reason) {

    public static final Set<String> ALLOWED_REASONS = Set.of(
            "CUSTOMER_SUPPORT",
            "INCIDENT_RESPONSE",
            "INVENTORY_AUDIT",
            "FULFILLMENT_RECOVERY");

    public FulfillmentAdminRevealRequest {
        reason = reason == null ? null : reason.trim().toUpperCase(Locale.ROOT);
    }

    public String requiredReason() {
        if (reason == null || !ALLOWED_REASONS.contains(reason)) {
            throw new FulfillmentPayloadValidationException("Reveal reason is invalid");
        }
        return reason;
    }
}
