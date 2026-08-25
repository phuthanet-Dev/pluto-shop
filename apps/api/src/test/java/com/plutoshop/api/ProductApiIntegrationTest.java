package com.plutoshop.api;

import static org.hamcrest.Matchers.aMapWithSize;
import static org.hamcrest.Matchers.allOf;
import static org.hamcrest.Matchers.hasKey;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class ProductApiIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Test
    void getProductsReturnsTheEntireCatalogInOriginalOrder() throws Exception {
        mockMvc.perform(get("/api/v1/products"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andExpect(jsonPath("$", allOf(
                        aMapWithSize(3), hasKey("items"), hasKey("total"), hasKey("priceRange"))))
                .andExpect(jsonPath("$.total").value(36))
                .andExpect(jsonPath("$.items.length()").value(36))
                .andExpect(jsonPath("$.items[0]", allOf(
                        aMapWithSize(18),
                        hasKey("id"), hasKey("slug"), hasKey("nameTh"), hasKey("nameEn"),
                        hasKey("descriptionTh"), hasKey("descriptionEn"), hasKey("visualCode"),
                        hasKey("type"), hasKey("selectionMode"), hasKey("optionGroup"),
                        hasKey("optionLabelTh"), hasKey("optionLabelEn"),
                        hasKey("priceMinor"), hasKey("currency"),
                        hasKey("stockQuantity"), hasKey("bundleItemCount"),
                        hasKey("instantDelivery"), hasKey("catalogOrder"))))
                .andExpect(jsonPath("$.items[0].id").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("creator-launch-kit"))
                .andExpect(jsonPath("$.items[0].nameEn").value("Creator Launch Kit"))
                .andExpect(jsonPath("$.items[0].visualCode").value("CL"))
                .andExpect(jsonPath("$.items[0].type").value("BUNDLE"))
                .andExpect(jsonPath("$.items[0].selectionMode").value("SINGLE_OPTION"))
                .andExpect(jsonPath("$.items[0].optionGroup").doesNotExist())
                .andExpect(jsonPath("$.items[0].optionLabelTh").doesNotExist())
                .andExpect(jsonPath("$.items[0].optionLabelEn").doesNotExist())
                .andExpect(jsonPath("$.items[0].priceMinor").value(101_500))
                .andExpect(jsonPath("$.items[0].currency").value("THB"))
                .andExpect(jsonPath("$.items[0].stockQuantity").value(1))
                .andExpect(jsonPath("$.items[0].bundleItemCount").value(4))
                .andExpect(jsonPath("$.items[0].instantDelivery").value(true))
                .andExpect(jsonPath("$.items[0].catalogOrder").value(1))
                .andExpect(jsonPath("$.items[35].slug").value("digital-product-launch-checklist"))
                .andExpect(jsonPath("$.items[35].catalogOrder").value(36))
                .andExpect(jsonPath("$.priceRange.minMinor").value(21_000))
                .andExpect(jsonPath("$.priceRange.maxMinor").value(126_000))
                .andExpect(jsonPath("$.priceRange.currency").value("THB"));
    }

    @Test
    void searchTrimsAndFindsBilingualNamesAndDescriptionsCaseInsensitively() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("q", "  AURORA  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("aurora-ui-component-library"))
                .andExpect(jsonPath("$.priceRange.minMinor").value(21_000))
                .andExpect(jsonPath("$.priceRange.maxMinor").value(126_000));

        mockMvc.perform(get("/api/v1/products").param("q", "LAYOUTS FOR LONG-FORM"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("editorial-presentation-deck"));

        mockMvc.perform(get("/api/v1/products").param("q", "ติดตามรายรับรายจ่าย"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].slug").value("personal-budget-spreadsheet"));
    }

    @Test
    void searchTreatsLikeWildcardsAsLiteralText() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("q", "%"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));

        mockMvc.perform(get("/api/v1/products").param("q", "_"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void maxPriceFiltersInclusivelyWithoutChangingCatalogPriceRange() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("maxPriceMinor", "31500"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(5))
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.items[0].slug").value("invoice-quote-template-bundle"))
                .andExpect(jsonPath("$.items[0].priceMinor").value(31_500))
                .andExpect(jsonPath("$.items[4].slug").value("digital-product-launch-checklist"))
                .andExpect(jsonPath("$.priceRange.minMinor").value(21_000))
                .andExpect(jsonPath("$.priceRange.maxMinor").value(126_000));
    }

    @Test
    void stockFiltersReflectThatEverySourceProductIsAvailable() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("inStock", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(36))
                .andExpect(jsonPath("$.items.length()").value(36));

        mockMvc.perform(get("/api/v1/products").param("inStock", "false"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0))
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.priceRange.minMinor").value(21_000))
                .andExpect(jsonPath("$.priceRange.maxMinor").value(126_000));
    }

    @Test
    void blankQueryAndOmittedFiltersResetToTheEntireCatalog() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("q", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(36))
                .andExpect(jsonPath("$.items.length()").value(36))
                .andExpect(jsonPath("$.items[0].catalogOrder").value(1))
                .andExpect(jsonPath("$.items[35].catalogOrder").value(36));
    }

    @Test
    void negativeMaxPriceReturnsSanitizedProblemDetails() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("maxPriceMinor", "-1"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.type").value("about:blank"))
                .andExpect(jsonPath("$.title").value("Invalid request parameters"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value(
                        "maxPriceMinor must be greater than or equal to 0"))
                .andExpect(jsonPath("$.instance").doesNotExist())
                .andExpect(jsonPath("$.path").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.exception").doesNotExist());
    }

    @Test
    void invalidParameterTypesReturnSanitizedProblemDetails() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("maxPriceMinor", "not-a-number"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid request parameters"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("maxPriceMinor must be a whole number"))
                .andExpect(jsonPath("$.instance").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());

        mockMvc.perform(get("/api/v1/products").param("maxPriceMinor", ""))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.detail").value("maxPriceMinor must be a whole number"));

        mockMvc.perform(get("/api/v1/products").param("inStock", "sometimes"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid request parameters"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("inStock must be true or false"))
                .andExpect(jsonPath("$.instance").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void booleanAliasesAreRejectedInsteadOfBeingCoerced() throws Exception {
        for (String value : List.of("", "yes", "no", "on", "off", "1", "0")) {
            mockMvc.perform(get("/api/v1/products").param("inStock", value))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.detail").value("inStock must be true or false"));
        }
    }

    @Test
    void overlongQueryReturnsSanitizedProblemDetailsAfterTrimming() throws Exception {
        mockMvc.perform(get("/api/v1/products").param("q", "x".repeat(121)))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value("Invalid request parameters"))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.detail").value("q must not exceed 120 characters"))
                .andExpect(jsonPath("$.instance").doesNotExist())
                .andExpect(jsonPath("$.path").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist());

        mockMvc.perform(get("/api/v1/products").param("q", "  " + "x".repeat(120) + "  "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
    }

    @Test
    void adminEndpointRequiresAnAuthenticatedAdminRole() throws Exception {
        mockMvc.perform(get("/api/v1/admin/ping"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/v1/admin/ping").with(jwt()
                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"))))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/admin/ping").with(jwt()
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("authenticated"));
    }

    @Test
    void actuatorHealthReportsUp() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
