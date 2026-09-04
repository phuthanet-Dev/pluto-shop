package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class FulfillmentPayloadValidatorTest {

    private final FulfillmentPayloadValidator validator = new FulfillmentPayloadValidator();

    @Test
    void acceptsEachSupportedTypedPayloadWithoutChangingOpaqueValues() {
        FulfillmentPayload discord = new FulfillmentPayload.DiscordAccount(
                "discord-user@example.test", "  password with spaces  ");
        FulfillmentPayload license = new FulfillmentPayload.LicenseKey("LICENSE-ABC-123");
        FulfillmentPayload invite = new FulfillmentPayload.InviteUrl("https://discord.gg/example-token");
        FulfillmentPayload code = new FulfillmentPayload.RedeemCode("CODE-123");

        assertThat(validator.validate(FulfillmentType.DISCORD_ACCOUNT, 1, discord)).isSameAs(discord);
        assertThat(validator.validate(FulfillmentType.LICENSE_KEY, 1, license)).isSameAs(license);
        assertThat(validator.validate(FulfillmentType.INVITE_URL, 1, invite)).isSameAs(invite);
        assertThat(validator.validate(FulfillmentType.REDEEM_CODE, 1, code)).isSameAs(code);
        assertThat(((FulfillmentPayload.DiscordAccount) discord).password())
                .isEqualTo("  password with spaces  ");
    }

    @Test
    void rejectsTypeAndSchemaMismatches() {
        FulfillmentPayload license = new FulfillmentPayload.LicenseKey("LICENSE-ABC-123");

        assertThatThrownBy(() -> validator.validate(FulfillmentType.DISCORD_ACCOUNT, 1, license))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Fulfillment payload type is invalid");
        assertThatThrownBy(() -> validator.validate(FulfillmentType.LICENSE_KEY, 2, license))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Fulfillment payload schema is unsupported");
    }

    @Test
    void rejectsUnsafeOrMalformedFields() {
        assertThatThrownBy(() -> validator.validate(
                FulfillmentType.DISCORD_ACCOUNT,
                1,
                new FulfillmentPayload.DiscordAccount("not-an-email", "password")))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Discord email is invalid");
        assertThatThrownBy(() -> validator.validate(
                FulfillmentType.DISCORD_ACCOUNT,
                1,
                new FulfillmentPayload.DiscordAccount("a@example.test", "bad\u0000password")))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Discord password contains unsupported characters");
        assertThatThrownBy(() -> validator.validate(
                FulfillmentType.INVITE_URL,
                1,
                new FulfillmentPayload.InviteUrl("http://discord.gg/example-token")))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Invite URL must use HTTPS");
        assertThatThrownBy(() -> validator.validate(
                FulfillmentType.REDEEM_CODE,
                1,
                new FulfillmentPayload.RedeemCode("")))
                .isInstanceOf(FulfillmentPayloadValidationException.class)
                .hasMessage("Redeem code is required");
    }
}
