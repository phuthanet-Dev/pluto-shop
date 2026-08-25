package com.plutoshop.api.admin;

import static org.hamcrest.Matchers.containsString;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.assertj.core.api.Assertions.assertThat;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AdminProductApiIntegrationTest {

    private static final AtomicInteger ORDER = new AtomicInteger(10_000);

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.admin.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.admin.username", POSTGRES::getUsername);
        registry.add("spring.datasource.admin.password", POSTGRES::getPassword);
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;


    @AfterEach
    void removeTestProducts() {
        jdbcTemplate.update("""
                DELETE FROM product_audit_log
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE slug LIKE 'phase3-test-%'");
    }

    @Test
    void anonymousCannotCreateProducts() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-anonymous")))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void customerCannotCreateProducts() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-customer")))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousAndCustomerCannotReadAdminProducts() throws Exception {
        mockMvc.perform(get("/api/v1/admin/products"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/products")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanCreateProductAndAuditActorComesFromJwt() throws Exception {
        String slug = "phase3-test-create";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value(slug))
                .andExpect(jsonPath("$.active").value(true))
                .andExpect(jsonPath("$.version").value(0))
                .andExpect(jsonPath("$.updatedBy").value("admin-subject"));

        Integer audits = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_audit_log WHERE product_id = (SELECT id FROM products WHERE slug = ?)",
                Integer.class,
                slug);
        org.junit.jupiter.api.Assertions.assertEquals(1, audits);
        org.junit.jupiter.api.Assertions.assertEquals(
                "admin-subject",
                jdbcTemplate.queryForObject(
                        "SELECT actor_subject FROM product_audit_log WHERE product_id = (SELECT id FROM products WHERE slug = ?)",
                        String.class,
                        slug));
    }

    @Test
    void adminCanCreateMultiOptionProductMetadata() throws Exception {
        String body = productJson("phase3-test-option")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"claude-full-access\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"Claude FA Unlimited [7 วัน]\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Claude FA Unlimited [7 Days]\"");

        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.selectionMode").value("MULTI_OPTION"))
                .andExpect(jsonPath("$.optionGroup").value("claude-full-access"))
                .andExpect(jsonPath("$.optionLabelEn").value("Claude FA Unlimited [7 Days]"));
    }

    @Test
    void invalidPriceReturnsSanitizedBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-invalid").replace("\"priceMinor\":12345", "\"priceMinor\":-1")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.title").value(containsString("Invalid")))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void duplicateSlugReturnsConflict() throws Exception {
        String body = productJson("phase3-test-duplicate");
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.replace("\"catalogOrder\":10000", "\"catalogOrder\":10001")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));
    }

    @Test
    void adminCanSearchProductsAndUpdateStockWithVersion() throws Exception {
        String slug = "phase3-test-stock";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long id = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        mockMvc.perform(get("/api/v1/admin/products").with(adminJwt()).param("q", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].slug").value(slug));

        mockMvc.perform(patch("/api/v1/admin/products/{id}/stock", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stockQuantity":9,"bundleItemCount":null,"version":0}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stockQuantity").value(9))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void staleUpdateReturnsConflictAndArchiveHidesProductFromPublicCatalog() throws Exception {
        String slug = "phase3-test-archive";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.slug").value(slug));
        long id = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        mockMvc.perform(patch("/api/v1/admin/products/{id}", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug).replace("\"catalogOrder\":10000", "\"catalogOrder\":10002")
                                .replace("\"version\":0", "\"version\":0")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(patch("/api/v1/admin/products/{id}", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug).replace("\"catalogOrder\":10000", "\"catalogOrder\":10003")))
                .andExpect(status().isConflict());

        mockMvc.perform(delete("/api/v1/admin/products/{id}", id)
                        .with(adminJwt())
                        .param("version", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.version").value(2));

        mockMvc.perform(get("/api/v1/products").param("q", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));

        Integer auditCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_audit_log WHERE product_id = ?", Integer.class, id);
        assertThat(auditCount).isGreaterThanOrEqualTo(3);
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor adminJwt() {
        return jwt()
                .jwt(jwt -> jwt.subject("admin-subject").issuer("https://issuer.example/realms/pluto"))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private static String productJson(String slug) {
        return """
                {
                  "slug":"%s",
                  "nameTh":"สินค้า Phase 3",
                  "nameEn":"Phase 3 Product",
                  "descriptionTh":"คำอธิบายสินค้า Phase 3",
                  "descriptionEn":"Phase 3 product description",
                  "visualCode":"P3-%s",
                  "type":"SINGLE",
                  "selectionMode":"SINGLE_OPTION",
                  "optionGroup":null,
                  "optionLabelTh":null,
                  "optionLabelEn":null,
                  "priceMinor":12345,
                  "currency":"THB",
                  "stockQuantity":5,
                  "bundleItemCount":null,
                  "instantDelivery":true,
                  "catalogOrder":%d,
                  "version":0,
                  "active":true
                }
                """.formatted(slug, slug.substring("phase3-test-".length()).toUpperCase(), ORDER.getAndIncrement());
    }
}
