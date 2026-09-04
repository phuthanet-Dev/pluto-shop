package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

import com.plutoshop.api.admin.AdminProductService;

import tools.jackson.databind.ObjectMapper;

class FulfillmentAdminServiceIntegrationTest {

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");
    private static NamedParameterJdbcTemplate jdbc;
    private static FulfillmentAdminService service;
    private static final AtomicInteger PRODUCT_ORDER = new AtomicInteger(9000);

    @BeforeAll
    static void startDatabase() {
        POSTGRES.start();
        jdbc = new NamedParameterJdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
        createRoles();
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        FulfillmentSecretCodec codec = new FulfillmentSecretCodec(
                "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8),
                "abcdef0123456789abcdef0123456789".getBytes(StandardCharsets.UTF_8),
                1,
                new ObjectMapper());
        service = new FulfillmentAdminService(jdbc, codec, new ObjectMapper());
    }

    @AfterAll
    static void stopDatabase() {
        POSTGRES.stop();
    }

    @Test
    void storesTypedInventoryEncryptedAndOnlyRevealsItExplicitly() {
        long productId = insertProduct();
        AdminProductService.AdminActor actor = new AdminProductService.AdminActor(
                "https://issuer.example.test", "synthetic-admin");
        FulfillmentProfileResponse profile = service.updateProfile(
                productId,
                new FulfillmentProfileWriteRequest(
                        FulfillmentType.DISCORD_ACCOUNT,
                        "DISCORD",
                        1,
                        0,
                        List.of(new FulfillmentStepRequest(
                                1,
                                FulfillmentAudience.CUSTOMER,
                                "เข้าสู่ระบบ",
                                "Sign in",
                                "ใช้ข้อมูลที่ได้รับและเปลี่ยนรหัสผ่านทันที",
                                "Use the delivered credentials and change the password immediately.",
                                null,
                                true))),
                actor);

        assertThat(profile.fulfillmentType()).isEqualTo(FulfillmentType.DISCORD_ACCOUNT);
        assertThat(profile.steps()).hasSize(1);

        FulfillmentInventoryResponse item = service.addInventory(
                productId,
                new FulfillmentInventoryWriteRequest(
                        FulfillmentType.DISCORD_ACCOUNT,
                        "DISCORD",
                        Map.of("email", "synthetic@example.test", "password", "synthetic-password"),
                        Map.of("region", "GLOBAL")),
                actor);

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT secret_ciphertext, secret_nonce FROM digital_inventory_items WHERE id = :id",
                Map.of("id", item.id()));
        byte[] ciphertext = (byte[]) row.get("secret_ciphertext");
        assertThat(new String(ciphertext, StandardCharsets.UTF_8))
                .doesNotContain("synthetic@example.test")
                .doesNotContain("synthetic-password");
        assertThat(((byte[]) row.get("secret_nonce"))).hasSize(12);

        FulfillmentInventoryListResponse list = service.listInventory(productId);
        assertThat(list.items()).hasSize(1);
        assertThat(list.items().get(0).publicMetadata()).containsEntry("region", "GLOBAL");

        FulfillmentRevealResponse revealed = service.revealInventory(productId, item.id(), actor, "INVENTORY_AUDIT");
        assertThat(revealed.fields())
                .containsEntry("email", "synthetic@example.test")
                .containsEntry("password", "synthetic-password");
        assertThat(revealed.toString()).doesNotContain("synthetic-password");

        assertThatThrownBy(() -> service.addInventory(
                productId,
                new FulfillmentInventoryWriteRequest(
                        FulfillmentType.DISCORD_ACCOUNT,
                        "DISCORD",
                        Map.of("email", "synthetic@example.test", "password", "different-password"),
                        Map.of()),
                actor))
                .isInstanceOf(FulfillmentConflictException.class);

        assertThatThrownBy(() -> service.updateProfile(
                productId,
                new FulfillmentProfileWriteRequest(
                        FulfillmentType.DISCORD_ACCOUNT,
                        "OTHER_PROVIDER",
                        1,
                        0,
                        List.of()),
                actor))
                .isInstanceOf(FulfillmentConflictException.class);
    }

    @Test
    void importsMultipleTypedInventoryItemsAsOneProfileBatch() {
        long productId = insertProduct();
        AdminProductService.AdminActor actor = new AdminProductService.AdminActor(
                "https://issuer.example.test", "synthetic-admin");
        service.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.LICENSE_KEY, "SYNTHETIC", 1, 0, List.of()), actor);

        FulfillmentInventoryListResponse imported = service.importInventory(
                productId,
                new FulfillmentInventoryImportRequest(List.of(
                        new FulfillmentInventoryWriteRequest(
                                FulfillmentType.LICENSE_KEY, "SYNTHETIC",
                                Map.of("licenseKey", "batch-license-1"), Map.of()),
                        new FulfillmentInventoryWriteRequest(
                                FulfillmentType.LICENSE_KEY, "SYNTHETIC",
                                Map.of("licenseKey", "batch-license-2"), Map.of()))),
                actor);

        assertThat(imported.total()).isEqualTo(2);
        assertThat(imported.available()).isEqualTo(2);
        assertThat(imported.items()).extracting(FulfillmentInventoryResponse::fulfillmentType)
                .containsOnly(FulfillmentType.LICENSE_KEY);
    }

    private static long insertProduct() {
        int order = PRODUCT_ORDER.incrementAndGet();
        return jdbc.queryForObject("""
                INSERT INTO products (
                    slug, name_th, name_en, description_th, description_en,
                    selection_mode, price_minor, currency, stock_quantity,
                    instant_delivery, catalog_order,
                    short_description_th, short_description_en, delivery_type,
                    warranty_days, stock_warning_threshold, status, sort_order,
                    active, updated_by, version
                ) VALUES (
                    :slug, 'สินค้า test', 'Test product',
                    'คำอธิบาย test', 'Test description',
                    'SINGLE_OPTION', 100, 'THB', 0,
                    TRUE, :catalogOrder,
                    'สั้น', 'Short', 'INSTANT',
                    0, 0, 'ACTIVE', :catalogOrder,
                    TRUE, 'synthetic-admin', 0
                ) RETURNING id
                """, Map.of("slug", "fulfillment-test-product-" + order, "catalogOrder", order), Long.class);
    }

    private static void createRoles() {
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_user NOLOGIN");
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_admin NOLOGIN");
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_inspector NOLOGIN");
    }
}
