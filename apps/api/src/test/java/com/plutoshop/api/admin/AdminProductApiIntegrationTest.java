package com.plutoshop.api.admin;

import static org.hamcrest.Matchers.containsString;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.concurrent.atomic.AtomicInteger;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

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
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.assertThat;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class AdminProductApiIntegrationTest {

    private static final AtomicInteger ORDER = new AtomicInteger(10_000);
    private static final Path IMAGE_ROOT = createImageRoot();

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
        registry.add("product-media.root", () -> IMAGE_ROOT.toString());
        registry.add("fulfillment.security.encryption-key-base64",
                () -> "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=");
        registry.add("fulfillment.security.fingerprint-key-base64",
                () -> "YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODk=");
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;


    @AfterEach
    void removeTestProducts() {
        jdbcTemplate.update("""
                DELETE FROM fulfillment_audit_log
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM order_fulfillment_allocations
                WHERE order_fulfillment_id IN (
                    SELECT f.id
                    FROM order_fulfillments f
                    JOIN products p ON p.id = f.product_id
                    WHERE p.slug LIKE 'phase3-test-%'
                )
                """);
        jdbcTemplate.update("""
                DELETE FROM order_fulfillments
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM digital_inventory_items
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM product_fulfillment_steps
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("""
                DELETE FROM product_fulfillment_profiles
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("DELETE FROM shop_order_items WHERE product_slug LIKE 'phase3-test-%'");
        jdbcTemplate.update("DELETE FROM shop_orders WHERE idempotency_key LIKE 'phase3-test-%'");
        jdbcTemplate.update("""
                DELETE FROM cart_items
                WHERE cart_id IN (SELECT id FROM carts WHERE user_id IN (
                    SELECT id FROM app_users WHERE subject LIKE 'phase3-delete-user-%'
                ))
                """);
        jdbcTemplate.update("DELETE FROM carts WHERE user_id IN (SELECT id FROM app_users WHERE subject LIKE 'phase3-delete-user-%')");
        jdbcTemplate.update("DELETE FROM app_users WHERE subject LIKE 'phase3-delete-user-%'");
        jdbcTemplate.update("DELETE FROM product_audit_log WHERE changed_fields ->> 'slug' LIKE 'phase3-test-%'");
        jdbcTemplate.update("""
                DELETE FROM product_audit_log
                WHERE product_id IN (SELECT id FROM products WHERE slug LIKE 'phase3-test-%')
                """);
        jdbcTemplate.update("DELETE FROM products WHERE slug LIKE 'phase3-test-%'");
        jdbcTemplate.update("DELETE FROM product_option_groups WHERE option_group LIKE 'phase3-test-%'");
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
    void anonymousAndCustomerCannotDeleteProducts() throws Exception {
        mockMvc.perform(delete("/api/v1/admin/products/1").param("version", "0"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/v1/admin/products/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .param("version", "0"))
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
    void adminCanReadOneProductByIdWhileOtherRolesCannot() throws Exception {
        mockMvc.perform(get("/api/v1/admin/products/1").with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(1));
        mockMvc.perform(get("/api/v1/admin/products/1"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/products/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"))))
                .andExpect(status().isForbidden());
    }

    @Test
    void anonymousAndCustomerCannotUpdateProductMetadata() throws Exception {
        mockMvc.perform(patch("/api/v1/admin/products/1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-unauthorized-update")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/v1/admin/products/1")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-unauthorized-update")))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminCanUploadReplaceAndRemoveProductImageWithPostCommitCleanup() throws Exception {
        String slug = "phase3-test-image-lifecycle";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        byte[] jpeg = validJpeg();
        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(new MockMultipartFile("file", "cover.jpg", "image/jpeg", jpeg))
                        .with(adminJwt())
                        .param("version", "0"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasImage").value(true))
                .andExpect(jsonPath("$.imageContentType").value("image/jpeg"))
                .andExpect(jsonPath("$.imageSizeBytes").value(jpeg.length))
                .andExpect(jsonPath("$.imageWidth").value(16))
                .andExpect(jsonPath("$.imageHeight").value(16))
                .andExpect(jsonPath("$.version").value(1));
        String firstKey = jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId);
        assertThat(firstKey).isNotBlank();
        assertThat(Files.readAllBytes(IMAGE_ROOT.resolve(firstKey))).containsExactly(jpeg);

        byte[] png = validPng();
        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(new MockMultipartFile("file", "cover.png", "image/png", png))
                        .with(adminJwt())
                        .param("version", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.imageContentType").value("image/png"))
                .andExpect(jsonPath("$.version").value(2));
        String secondKey = jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId);
        assertThat(secondKey).isNotEqualTo(firstKey);
        assertThat(Files.exists(IMAGE_ROOT.resolve(firstKey))).isFalse();
        assertThat(Files.readAllBytes(IMAGE_ROOT.resolve(secondKey))).containsExactly(png);

        mockMvc.perform(delete("/api/v1/admin/products/{id}/image", productId)
                        .with(adminJwt())
                        .param("version", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasImage").value(false))
                .andExpect(jsonPath("$.imageContentType").doesNotExist())
                .andExpect(jsonPath("$.version").value(3));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId)).isNull();
        assertThat(Files.exists(IMAGE_ROOT.resolve(secondKey))).isFalse();
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_audit_log
                WHERE product_id = ? AND actor_subject = 'admin-subject'
                  AND action = 'UPDATE' AND changed_fields::text LIKE '%image%'
                """, Integer.class, productId)).isEqualTo(3);
    }

    @Test
    void anonymousAndCustomerCannotUploadOrDeleteProductImage() throws Exception {
        MockMultipartFile image = new MockMultipartFile(
                "file", "cover.jpg", "image/jpeg", validJpeg());

        mockMvc.perform(multipart("/api/v1/admin/products/1/image")
                        .file(image)
                        .param("version", "0"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(multipart("/api/v1/admin/products/1/image")
                        .file(image)
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .param("version", "0"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/v1/admin/products/1/image")
                        .param("version", "0"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/v1/admin/products/1/image")
                        .with(jwt().authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER")))
                        .param("version", "0"))
                .andExpect(status().isForbidden());
    }

    @Test
    void invalidProductImageReturnsSanitizedBadRequestAndDoesNotSetMetadata() throws Exception {
        String slug = "phase3-test-invalid-image";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);
        MockMultipartFile invalid = new MockMultipartFile(
                "file", "cover.jpg", "image/jpeg", "not an image".getBytes());

        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(invalid)
                        .with(adminJwt())
                        .param("version", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.trace").doesNotExist())
                .andExpect(jsonPath("$.path").doesNotExist());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId)).isNull();
    }

    @Test
    void oversizedProductImageReturnsPayloadTooLarge() throws Exception {
        String slug = "phase3-test-oversized-image";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);
        MockMultipartFile oversized = new MockMultipartFile(
                "file", "cover.jpg", "image/jpeg", new byte[5 * 1024 * 1024 + 1]);

        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(oversized)
                        .with(adminJwt())
                        .param("version", "0"))
                .andExpect(status().isPayloadTooLarge())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.status").value(413))
                .andExpect(jsonPath("$.trace").doesNotExist());
    }

    @Test
    void staleProductImageVersionReturnsConflictWithoutChangingMetadata() throws Exception {
        String slug = "phase3-test-stale-image";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(new MockMultipartFile("file", "cover.jpg", "image/jpeg", validJpeg()))
                        .with(adminJwt())
                        .param("version", "99"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.status").value(409));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId)).isNull();
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
                .andExpect(jsonPath("$.status").value("ACTIVE"))
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
    void adminCanCreateProductMetadataForTheProductFormAndCatalog() throws Exception {
        String slug = "phase3-test-metadata";
        String body = productJson(slug)
                .replaceFirst("\\\"sortOrder\\\":\\d+", "\"sortOrder\":20000")
                .replace("\"shortDescriptionTh\":\"คำอธิบายสั้น\"", "\"shortDescriptionTh\":\"คำโปรยสั้น\"")
                .replace("\"shortDescriptionEn\":\"Short product description\"", "\"shortDescriptionEn\":\"Short summary\"")
                .replace("\"deliveryType\":\"INSTANT\"", "\"deliveryType\":\"MANUAL\"")
                .replace("\"warrantyDays\":0", "\"warrantyDays\":30")
                .replace("\"stockWarningThreshold\":5", "\"stockWarningThreshold\":2")
                .replace("\"status\":\"ACTIVE\"", "\"status\":\"HIDDEN\"");

        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.shortDescriptionTh").value("คำโปรยสั้น"))
                .andExpect(jsonPath("$.shortDescriptionEn").value("Short summary"))
                .andExpect(jsonPath("$.deliveryType").value("MANUAL"))
                .andExpect(jsonPath("$.warrantyDays").value(30))
                .andExpect(jsonPath("$.stockWarningThreshold").value(2))
                .andExpect(jsonPath("$.status").value("HIDDEN"))
                .andExpect(jsonPath("$.sortOrder").value(20000));

        mockMvc.perform(get("/api/v1/admin/products")
                        .with(adminJwt())
                        .param("q", "Short summary"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].slug").value(slug));

        long productId = jdbcTemplate.queryForObject("SELECT id FROM products WHERE slug = ?", Long.class, slug);
        org.junit.jupiter.api.Assertions.assertThrows(
                org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbcTemplate.update("UPDATE products SET active = TRUE WHERE id = ?", productId));
        mockMvc.perform(get("/api/v1/products").param("q", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));
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
    void adminCanCreateMultipleMultiOptionChildrenWithIndependentDetailsAtomically() throws Exception {
        String first = productJson("phase3-test-multi-one")
                .replace("\"nameTh\":\"สินค้า Phase 3\"", "\"nameTh\":\"แพ็กเกจหนึ่ง\"")
                .replace("\"nameEn\":\"Phase 3 Product\"", "\"nameEn\":\"First package\"")
                .replace("\"descriptionTh\":\"คำอธิบายสินค้า Phase 3\"", "\"descriptionTh\":\"รายละเอียดแพ็กเกจหนึ่ง\"")
                .replace("\"descriptionEn\":\"Phase 3 product description\"", "\"descriptionEn\":\"First package details\"")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-multi\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"แพ็กเกจหนึ่ง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"First package\"");
        String second = productJson("phase3-test-multi-two")
                .replace("\"nameTh\":\"สินค้า Phase 3\"", "\"nameTh\":\"แพ็กเกจสอง\"")
                .replace("\"nameEn\":\"Phase 3 Product\"", "\"nameEn\":\"Second package\"")
                .replace("\"descriptionTh\":\"คำอธิบายสินค้า Phase 3\"", "\"descriptionTh\":\"รายละเอียดแพ็กเกจสอง\"")
                .replace("\"descriptionEn\":\"Phase 3 product description\"", "\"descriptionEn\":\"Second package details\"")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-multi\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"แพ็กเกจสอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Second package\"");

        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + first + "," + second + "]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(2))
                .andExpect(jsonPath("$.items[0].slug").value("phase3-test-multi-one"))
                .andExpect(jsonPath("$.items[0].descriptionEn").value("First package details"))
                .andExpect(jsonPath("$.items[1].slug").value("phase3-test-multi-two"))
                .andExpect(jsonPath("$.items[1].descriptionEn").value("Second package details"));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = 'phase3-multi'", Integer.class))
                .isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_audit_log WHERE action = 'CREATE' AND product_id IN (SELECT id FROM products WHERE option_group = 'phase3-multi')",
                Integer.class))
                .isEqualTo(2);
    }

    @Test
    void adminCanAppendChildAndReuseSharedCardDataForAnExistingMultiOptionGroup() throws Exception {
        String first = productJson("phase3-test-group-one")
                .replace("\"nameTh\":\"สินค้า Phase 3\"", "\"nameTh\":\"ชื่อเดิมหนึ่ง\"")
                .replace("\"nameEn\":\"Phase 3 Product\"", "\"nameEn\":\"Old name one\"")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ตัวเลือกหนึ่ง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Option one\"");
        String second = productJson("phase3-test-group-two")
                .replace("\"nameTh\":\"สินค้า Phase 3\"", "\"nameTh\":\"ชื่อเดิมสอง\"")
                .replace("\"nameEn\":\"Phase 3 Product\"", "\"nameEn\":\"Old name two\"")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ตัวเลือกสอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Option two\"");
        String sharedCard = """
                {"nameTh":"แพ็กเกจรวม","nameEn":"Shared package","shortDescriptionTh":"คำโปรยรวม","shortDescriptionEn":"Shared summary","version":0}
                """;

        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"group\":" + sharedCard + ",\"items\":[" + first + "," + second + "]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.items[0].nameTh").value("แพ็กเกจรวม"))
                .andExpect(jsonPath("$.items[1].nameEn").value("Shared package"));

        String third = productJson("phase3-test-group-three")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ตัวเลือกสาม\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Option three\"");
        mockMvc.perform(post("/api/v1/admin/products/multi/{optionGroup}/children", "phase3-test-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"group\":" + sharedCard + ",\"items\":[" + third + "]}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.total").value(1))
                .andExpect(jsonPath("$.items[0].nameTh").value("แพ็กเกจรวม"));

        mockMvc.perform(get("/api/v1/admin/products/multi/{optionGroup}", "phase3-test-group")
                        .with(adminJwt()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.optionGroup").value("phase3-test-group"))
                .andExpect(jsonPath("$.nameTh").value("แพ็กเกจรวม"))
                .andExpect(jsonPath("$.shortDescriptionEn").value("Shared summary"))
                .andExpect(jsonPath("$.items.length()").value(3));

        mockMvc.perform(get("/api/v1/products").param("q", "แพ็กเกจรวม"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].nameTh").value("แพ็กเกจรวม"))
                .andExpect(jsonPath("$.items[0].shortDescriptionEn").value("Shared summary"));
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_option_groups WHERE option_group = 'phase3-test-group'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void staleMultiOptionGroupVersionDoesNotOverwriteSharedCardData() throws Exception {
        String first = productJson("phase3-test-stale-one")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-stale-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"เก่า หนึ่ง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Old one\"");
        String second = productJson("phase3-test-stale-two")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-stale-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"เก่า สอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Old two\"");
        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + first + "," + second + "]}"))
                .andExpect(status().isCreated());

        String updatedCard = """
                {"nameTh":"ชื่อชุดใหม่","nameEn":"New package","shortDescriptionTh":"คำโปรยใหม่","shortDescriptionEn":"New summary","version":0}
                """;
        mockMvc.perform(patch("/api/v1/admin/products/multi/{optionGroup}", "phase3-test-stale-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updatedCard))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(patch("/api/v1/admin/products/multi/{optionGroup}", "phase3-test-stale-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updatedCard))
                .andExpect(status().isConflict());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = 'phase3-test-stale-group' AND name_th = 'ชื่อชุดใหม่'",
                Integer.class)).isEqualTo(2);
    }

    @Test
    void appendingMultiOptionChildrenRollsBackTheWholeBatchOnConflict() throws Exception {
        String first = productJson("phase3-test-append-rollback-one")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-append-rollback-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ชุดแรก\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"First\"");
        String second = productJson("phase3-test-append-rollback-two")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-append-rollback-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ชุดสอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Second\"");
        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + first + "," + second + "]}"))
                .andExpect(status().isCreated());

        String append = productJson("phase3-test-append-rollback-new")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-append-rollback-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"ชุดใหม่\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"New\"");
        String conflicting = append
                .replace("phase3-test-append-rollback-new", "phase3-test-append-rollback-one")
                .replace("\"optionLabelTh\":\"ชุดใหม่\"", "\"optionLabelTh\":\"ชุดชน\"")
                .replace("\"optionLabelEn\":\"New\"", "\"optionLabelEn\":\"Conflict\"")
                .replaceAll("\"sortOrder\":\\d+", "\"sortOrder\":999999");

        mockMvc.perform(post("/api/v1/admin/products/multi/{optionGroup}/children", "phase3-test-append-rollback-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + append + "," + conflicting + "]}"))
                .andExpect(status().isConflict());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE slug = 'phase3-test-append-rollback-new'", Integer.class)).isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = 'phase3-test-append-rollback-group'", Integer.class)).isEqualTo(2);
    }

    @Test
    void multiGroupWritesRequireAnExplicitVersion() throws Exception {
        String first = productJson("phase3-test-explicit-version-one")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-explicit-version-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการแรก\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"First item\"");
        String second = productJson("phase3-test-explicit-version-two")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-explicit-version-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการสอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Second item\"");
        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + first + "," + second + "]}"))
                .andExpect(status().isCreated());

        String groupWithoutVersion = """
                {
                  "nameTh":"ชื่อชุดใหม่",
                  "nameEn":"New group name",
                  "shortDescriptionTh":"คำโปรยใหม่",
                  "shortDescriptionEn":"New group summary"
                }
                """;
        mockMvc.perform(patch("/api/v1/admin/products/multi/{optionGroup}", "phase3-test-explicit-version-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupWithoutVersion))
                .andExpect(status().isBadRequest());

        String appendItem = productJson("phase3-test-explicit-version-three")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-test-explicit-version-group\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการสาม\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Third item\"");
        mockMvc.perform(post("/api/v1/admin/products/multi/{optionGroup}/children", "phase3-test-explicit-version-group")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"group":{"nameTh":"ชื่อชุดใหม่","nameEn":"New group name","shortDescriptionTh":"คำโปรยใหม่","shortDescriptionEn":"New group summary","version":null},"items":[%s]}
                                """.formatted(appendItem)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void concurrentMultiProductCreatesCanBootstrapTheSameGroup() throws Exception {
        String optionGroup = "phase3-test-concurrent-group";
        String first = productJson("phase3-test-concurrent-one")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"" + optionGroup + "\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการพร้อมกันหนึ่ง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Concurrent one\"")
                .replaceFirst("\"sortOrder\":\\d+", "\"sortOrder\":31001");
        String second = productJson("phase3-test-concurrent-two")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"" + optionGroup + "\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการพร้อมกันสอง\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Concurrent two\"")
                .replaceFirst("\"sortOrder\":\\d+", "\"sortOrder\":31002");
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<Integer> firstResult = executor.submit(() -> concurrentCreate(first, ready, start));
            Future<Integer> secondResult = executor.submit(() -> concurrentCreate(second, ready, start));
            assertThat(ready.await(30, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            assertThat(firstResult.get(30, TimeUnit.SECONDS)).isEqualTo(201);
            assertThat(secondResult.get(30, TimeUnit.SECONDS)).isEqualTo(201);
        } finally {
            executor.shutdownNow();
        }

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_option_groups WHERE option_group = ?", Integer.class, optionGroup))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = ?", Integer.class, optionGroup))
                .isEqualTo(2);
    }

    private int concurrentCreate(String body, CountDownLatch ready, CountDownLatch start) throws Exception {
        ready.countDown();
        if (!start.await(30, TimeUnit.SECONDS)) {
            throw new IllegalStateException("Concurrent test did not start");
        }
        return mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn()
                .getResponse()
                .getStatus();
    }

    @Test
    void multiCreateRollsBackEarlierChildrenWhenALaterChildConflicts() throws Exception {
        String existing = productJson("phase3-test-multi-existing")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-existing\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"มีอยู่แล้ว\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Existing\"");
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(existing))
                .andExpect(status().isCreated());

        String first = productJson("phase3-test-multi-rollback-first")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-rollback\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"รายการแรก\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"First\"");
        String conflicting = existing
                .replace("\"optionGroup\":\"phase3-existing\"", "\"optionGroup\":\"phase3-rollback\"")
                .replace("\"optionLabelTh\":\"มีอยู่แล้ว\"", "\"optionLabelTh\":\"รายการสอง\"")
                .replace("\"optionLabelEn\":\"Existing\"", "\"optionLabelEn\":\"Second\"");

        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + first + "," + conflicting + "]}"))
                .andExpect(status().isConflict());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE slug = 'phase3-test-multi-rollback-first'", Integer.class))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = 'phase3-rollback'", Integer.class))
                .isZero();
    }

    @Test
    void multiCreateRequiresAdminRole() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[]}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void multiCreateRejectsSingleOptionChildrenAsBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products/multi")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[" + productJson("phase3-test-single-one") + ","
                                + productJson("phase3-test-single-two") + "]}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void duplicateOptionLabelsAreRejectedWithinTheSameMultiOptionGroup() throws Exception {
        String first = productJson("phase3-test-duplicate-option-one")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-duplicate-option\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"เหมือนกัน\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Same option\"");
        String second = productJson("phase3-test-duplicate-option-two")
                .replace("\"selectionMode\":\"SINGLE_OPTION\"", "\"selectionMode\":\"MULTI_OPTION\"")
                .replace("\"optionGroup\":null", "\"optionGroup\":\"phase3-duplicate-option\"")
                .replace("\"optionLabelTh\":null", "\"optionLabelTh\":\"เหมือนกัน\"")
                .replace("\"optionLabelEn\":null", "\"optionLabelEn\":\"Same option\"");

        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(first))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(second))
                .andExpect(status().isConflict());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT count(*) FROM products WHERE option_group = 'phase3-duplicate-option'", Integer.class))
                .isEqualTo(1);
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
    void negativeWarrantyDaysReturnsSanitizedBadRequest() throws Exception {
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson("phase3-test-invalid-warranty").replace("\"warrantyDays\":0", "\"warrantyDays\":-1")))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
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
                        .content(body.replaceFirst("\\\"sortOrder\\\":\\d+", "\"sortOrder\":10001")))
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
                                {"stockQuantity":9,"version":0}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.stockQuantity").value(9))
                .andExpect(jsonPath("$.version").value(1));
    }

    @Test
    void inventoryBackedProductRejectsManualStockWrites() throws Exception {
        String slug = "phase3-test-inventory-stock";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long id = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        mockMvc.perform(put("/api/v1/admin/products/{id}/fulfillment", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fulfillmentType":"LICENSE_KEY","provider":"SYNTHETIC","payloadSchemaVersion":1,"version":0,"steps":[]}
                                """))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/admin/products/{id}/fulfillment/inventory", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fulfillmentType":"LICENSE_KEY","provider":"SYNTHETIC","payload":{"licenseKey":"synthetic-stock-license"},"publicMetadata":{}}
                                """))
                .andExpect(status().isCreated());

        long version = jdbcTemplate.queryForObject(
                "SELECT version FROM products WHERE id = ?", Long.class, id);
        mockMvc.perform(patch("/api/v1/admin/products/{id}/stock", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"stockQuantity":99,"version":%d}
                                """.formatted(version)))
                .andExpect(status().isConflict());

        assertThat(jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = ?", Integer.class, id)).isEqualTo(1);
    }

    @Test
    void staleUpdateReturnsConflictAndHardDeleteHidesProductFromPublicCatalog() throws Exception {
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
                        .content(productJson(slug).replace("\"sortOrder\":10000", "\"sortOrder\":10002")
                                .replace("\"version\":0", "\"version\":0")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.version").value(1));

        mockMvc.perform(patch("/api/v1/admin/products/{id}", id)
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug).replace("\"sortOrder\":10000", "\"sortOrder\":10003")))
                .andExpect(status().isConflict());

        mockMvc.perform(delete("/api/v1/admin/products/{id}", id)
                        .with(adminJwt())
                        .param("version", "1"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        mockMvc.perform(get("/api/v1/products").param("q", slug))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").value(0));

        Integer auditCount = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM product_audit_log WHERE action = 'DELETE' AND changed_fields ->> 'slug' = ?",
                Integer.class,
                slug);
        assertThat(auditCount).isEqualTo(1);
    }

    @Test
    void hardDeletingAProductRemovesItsMediaAfterCommit() throws Exception {
        String slug = "phase3-test-image-hard-delete";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);
        mockMvc.perform(multipart("/api/v1/admin/products/{id}/image", productId)
                        .file(new MockMultipartFile("file", "cover.jpg", "image/jpeg", validJpeg()))
                        .with(adminJwt())
                        .param("version", "0"))
                .andExpect(status().isOk());
        String imageKey = jdbcTemplate.queryForObject(
                "SELECT image_key FROM products WHERE id = ?", String.class, productId);
        assertThat(Files.exists(IMAGE_ROOT.resolve(imageKey))).isTrue();

        mockMvc.perform(delete("/api/v1/admin/products/{id}", productId)
                        .with(adminJwt())
                        .param("version", "1"))
                .andExpect(status().isNoContent());

        assertThat(Files.exists(IMAGE_ROOT.resolve(imageKey))).isFalse();
    }

    @Test
    void adminHardDeleteRemovesProductFromEveryCartAndPreservesOrderSnapshot() throws Exception {
        String slug = "phase3-test-hard-delete";
        mockMvc.perform(post("/api/v1/admin/products")
                        .with(adminJwt())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(productJson(slug)))
                .andExpect(status().isCreated());
        long productId = jdbcTemplate.queryForObject(
                "SELECT id FROM products WHERE slug = ?", Long.class, slug);

        long firstUserId = createTestUser("phase3-delete-user-1");
        long secondUserId = createTestUser("phase3-delete-user-2");
        long firstCartId = createActiveCart(firstUserId);
        long secondCartId = createActiveCart(secondUserId);
        jdbcTemplate.update("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)", firstCartId, productId);
        jdbcTemplate.update("INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 2)", secondCartId, productId);

        long orderId = jdbcTemplate.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (?, 'PAID', 'PROMPTPAY', 'THB', 12345, ?)
                RETURNING id
                """, Long.class, firstUserId, slug);
        jdbcTemplate.update("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (?, ?, ?, 'สินค้าที่ลบ', 'Deleted product', 12345, 1)
                """, orderId, productId, slug);

        mockMvc.perform(delete("/api/v1/admin/products/{id}", productId)
                        .with(adminJwt())
                        .param("version", "0"))
                .andExpect(status().isNoContent())
                .andExpect(content().string(""));

        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM products WHERE id = ?", Integer.class, productId))
                .isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM cart_items WHERE product_id = ?", Integer.class, productId))
                .isZero();
        assertThat(jdbcTemplate.queryForObject("SELECT count(*) FROM shop_order_items WHERE order_id = ?", Integer.class, orderId))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT product_id FROM shop_order_items WHERE order_id = ?", Long.class, orderId))
                .isNull();
        assertThat(jdbcTemplate.queryForObject("SELECT product_slug FROM shop_order_items WHERE order_id = ?", String.class, orderId))
                .isEqualTo(slug);
        assertThat(jdbcTemplate.queryForObject("""
                SELECT count(*) FROM product_audit_log
                WHERE action = 'DELETE' AND changed_fields ->> 'slug' = ?
                """, Integer.class, slug)).isEqualTo(1);
    }

    private long createTestUser(String subject) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.example/realms/pluto', ?, ?, ?)
                RETURNING id
                """, Long.class, subject, subject + "@example.invalid", subject);
    }

    private long createActiveCart(long userId) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO carts (user_id, status)
                VALUES (?, 'ACTIVE')
                RETURNING id
                """, Long.class, userId);
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
                  "shortDescriptionTh":"คำอธิบายสั้น",
                  "shortDescriptionEn":"Short product description",
                  "descriptionTh":"คำอธิบายสินค้า Phase 3",
                  "descriptionEn":"Phase 3 product description",
                  "selectionMode":"SINGLE_OPTION",
                  "optionGroup":null,
                  "optionLabelTh":null,
                  "optionLabelEn":null,
                  "priceMinor":12345,
                  "currency":"THB",
                  "stockQuantity":5,
                  "deliveryType":"INSTANT",
                  "warrantyDays":0,
                  "stockWarningThreshold":5,
                  "status":"ACTIVE",
                  "sortOrder":%d,
                  "version":0
                }
                """.formatted(slug, ORDER.getAndIncrement());
    }

    private static Path createImageRoot() {
        try {
            return Files.createTempDirectory("pluto-product-images-test-");
        } catch (IOException exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }

    private static byte[] validPng() throws Exception {
        BufferedImage image = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "png", output);
        return output.toByteArray();
    }

    private static byte[] validJpeg() throws Exception {
        BufferedImage image = new BufferedImage(16, 16, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", output);
        return output.toByteArray();
    }
}
