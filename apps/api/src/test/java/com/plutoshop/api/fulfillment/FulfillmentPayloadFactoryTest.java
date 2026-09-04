package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;

class FulfillmentPayloadFactoryTest {

    private final FulfillmentPayloadFactory factory = new FulfillmentPayloadFactory(
            new FulfillmentPayloadValidator());

    @Test
    void createsTypedDiscordPayloadFromAllowlistedFields() {
        FulfillmentPayload payload = factory.fromFields(
                FulfillmentType.DISCORD_ACCOUNT,
                Map.of("email", "synthetic@example.test", "password", "synthetic-password"));

        assertThat(payload).isInstanceOf(FulfillmentPayload.DiscordAccount.class);
        assertThat(((FulfillmentPayload.DiscordAccount) payload).email()).isEqualTo("synthetic@example.test");
    }

    @Test
    void rejectsUnknownOrMissingFieldsWithoutPersistingAnything() {
        Map<String, String> fields = new LinkedHashMap<>();
        fields.put("licenseKey", "LICENSE-123");
        fields.put("password", "should-not-be-accepted");

        assertThatThrownBy(() -> factory.fromFields(FulfillmentType.LICENSE_KEY, fields))
                .isInstanceOf(FulfillmentPayloadValidationException.class);
        assertThatThrownBy(() -> factory.fromFields(FulfillmentType.INVITE_URL, Map.of()))
                .isInstanceOf(FulfillmentPayloadValidationException.class);
    }

    @Test
    void rejectsNonSecretFulfillmentTypesFromInventoryFactory() {
        assertThatThrownBy(() -> factory.fromFields(FulfillmentType.MANUAL_INSTRUCTION, Map.of()))
                .isInstanceOf(FulfillmentPayloadValidationException.class);
        assertThatThrownBy(() -> factory.fromFields(FulfillmentType.NONE, Map.of()))
                .isInstanceOf(FulfillmentPayloadValidationException.class);
    }
}
