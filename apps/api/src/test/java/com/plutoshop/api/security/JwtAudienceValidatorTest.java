package com.plutoshop.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;

class JwtAudienceValidatorTest {

    private static final String API_AUDIENCE = "pluto-api";

    @Test
    void acceptsJwtWithExactApiAudience() {
        Jwt token = Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .audience(List.of(API_AUDIENCE))
                .build();

        assertThat(SecurityConfig.audienceValidator(API_AUDIENCE).validate(token).hasErrors()).isFalse();
    }

    @Test
    void acceptsAStringAudienceClaimWhenItMatchesExactly() {
        Jwt token = Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .claim("aud", API_AUDIENCE)
                .build();

        assertThat(SecurityConfig.audienceValidator(API_AUDIENCE).validate(token).hasErrors()).isFalse();
    }

    @Test
    void rejectsMissingDifferentOrSubstringAudience() {
        OAuth2TokenValidator<Jwt> validator = SecurityConfig.audienceValidator(API_AUDIENCE);

        Jwt missing = Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .claim("sub", "synthetic-user")
                .build();
        Jwt different = Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .audience(List.of("another-client"))
                .build();
        Jwt substring = Jwt.withTokenValue("synthetic-token")
                .header("alg", "RS256")
                .audience(List.of("pluto-api-admin"))
                .build();

        assertThat(validator.validate(missing).hasErrors()).isTrue();
        assertThat(validator.validate(different).hasErrors()).isTrue();
        assertThat(validator.validate(substring).hasErrors()).isTrue();
    }

    @Test
    void rejectsBlankExpectedAudienceConfiguration() {
        assertThatThrownBy(() -> SecurityConfig.audienceValidator(" "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsIncompleteResourceServerConfiguration() {
        assertThatThrownBy(() -> SecurityConfig.validateJwtConfiguration(
                "", "https://keys.example.invalid/jwks", API_AUDIENCE))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> SecurityConfig.validateJwtConfiguration(
                "https://issuer.example.invalid", "", API_AUDIENCE))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> SecurityConfig.validateJwtConfiguration(
                "https://issuer.example.invalid", "https://keys.example.invalid/jwks", ""))
                .isInstanceOf(IllegalStateException.class);
    }
}
