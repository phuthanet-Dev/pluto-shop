package com.plutoshop.api.security;

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.web.SecurityFilterChain;

import jakarta.servlet.http.HttpServletResponse;

@Configuration(proxyBeanMethods = false)
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiSecurity(
            HttpSecurity http,
            @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}") String issuer,
            @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri:}") String jwkSetUri)
            throws Exception {
        if (issuer.isBlank() && !jwkSetUri.isBlank()) {
            throw new IllegalStateException("JWT issuer is required when JWK set URI is configured");
        }
        http
                // The current API accepts bearer tokens, not browser-authenticated mutations.
                // Cookie-backed write endpoints must add CSRF protection before they are enabled.
                .csrf(csrf -> csrf.disable())
                .cors(cors -> cors.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/api/v1/products", "/api/v1/product-images/**").permitAll()
                        .requestMatchers("/api/v1/cart/**").authenticated()
                        .requestMatchers("/api/v1/checkout/**", "/api/v1/payments/**").authenticated()
                        .requestMatchers("/api/v1/orders/**").authenticated()
                        .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                        .anyRequest().denyAll())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, exception) -> writeProblem(response, 401, "Unauthorized"))
                        .accessDeniedHandler((request, response, exception) -> writeProblem(response, 403, "Forbidden")));

        if (!issuer.isBlank()) {
            http.oauth2ResourceServer(oauth2 -> oauth2
                    .jwt(jwt -> jwt.jwtAuthenticationConverter(realmRoleConverter())));
        }

        return http.build();
    }

    @Bean
    @ConditionalOnProperty(name = "spring.security.oauth2.resourceserver.jwt.issuer-uri")
    JwtDecoder jwtDecoder(
            @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String issuer,
            @Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri:}") String jwkSetUri,
            @Value("${spring.security.oauth2.resourceserver.jwt.audience:}") String audience)
            throws Exception {
        validateJwtConfiguration(issuer, jwkSetUri, audience);

        NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer),
                audienceValidator(audience)));
        return decoder;
    }

    static void validateJwtConfiguration(String issuer, String jwkSetUri, String audience) {
        if (issuer == null || issuer.isBlank() || jwkSetUri == null || jwkSetUri.isBlank()
                || audience == null || audience.isBlank()) {
            throw new IllegalStateException("JWT issuer, JWK set URI, and audience are required");
        }
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String expectedAudience) {
        if (expectedAudience == null || expectedAudience.isBlank()) {
            throw new IllegalArgumentException("Expected JWT audience must not be blank");
        }
        return jwt -> {
            Object audienceClaim = jwt.getClaims().get("aud");
            boolean matches = audienceClaim instanceof String audience
                    ? expectedAudience.equals(audience)
                    : audienceClaim instanceof Collection<?> audiences
                            && audiences.stream().anyMatch(expectedAudience::equals);
            return matches
                    ? OAuth2TokenValidatorResult.success()
                    : OAuth2TokenValidatorResult.failure(
                            new OAuth2Error("invalid_token", "Token audience is invalid", null));
        };
    }

    private static Converter<Jwt, ? extends org.springframework.security.authentication.AbstractAuthenticationToken>
            realmRoleConverter() {
        JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(SecurityConfig::realmAuthorities);
        return converter;
    }

    static Collection<GrantedAuthority> realmAuthorities(Jwt jwt) {
        Object realmAccess = jwt.getClaims().get("realm_access");
        if (!(realmAccess instanceof Map<?, ?> realmMap)) return List.of();
        Object roles = realmMap.get("roles");
        if (!(roles instanceof Collection<?> roleCollection)) return List.of();
        return roleCollection.stream()
                .filter(String.class::isInstance)
                .map(String.class::cast)
                .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role))
                .toList();
    }

    private static void writeProblem(HttpServletResponse response, int status, String title) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(
                "{\"type\":\"about:blank\",\"title\":\"" + title + "\",\"status\":" + status + "}");
    }
}
