package com.plutoshop.api.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class SecurityConfigTest {

    @Test
    void mapsKeycloakRealmRolesToSpringAuthorities() {
        Jwt token = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .claim("realm_access", Map.of("roles", List.of("CUSTOMER", "ADMIN")))
                .build();

        assertThat(SecurityConfig.realmAuthorities(token))
                .extracting(GrantedAuthority::getAuthority)
                .containsExactly("ROLE_CUSTOMER", "ROLE_ADMIN");
    }

    @Test
    void ignoresMissingOrMalformedRealmRoles() {
        Jwt token = Jwt.withTokenValue("test-token")
                .header("alg", "RS256")
                .claim("realm_access", Map.of("roles", List.of(1, true)))
                .build();

        assertThat(SecurityConfig.realmAuthorities(token)).isEmpty();
    }
}
