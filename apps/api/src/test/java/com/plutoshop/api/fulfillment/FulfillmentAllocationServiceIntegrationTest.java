package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.plutoshop.api.admin.AdminProductService;

import tools.jackson.databind.ObjectMapper;

@Testcontainers
class FulfillmentAllocationServiceIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    private static NamedParameterJdbcTemplate jdbc;
    private static FulfillmentAdminService adminService;
    private static FulfillmentAllocationService allocationService;
    private static final AtomicInteger CATALOG_ORDER = new AtomicInteger(9000);
    private static final AdminProductService.AdminActor ACTOR =
            new AdminProductService.AdminActor("https://issuer.test", "synthetic-admin");

    @BeforeAll
    static void setUpDatabase() throws Exception {
        POSTGRES.start();
        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute("CREATE ROLE pluto_user NOLOGIN");
            statement.execute("CREATE ROLE pluto_admin NOLOGIN");
            statement.execute("CREATE ROLE pluto_inspector NOLOGIN");
        }
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        jdbc = new NamedParameterJdbcTemplate(dataSource);
        ObjectMapper mapper = new ObjectMapper();
        FulfillmentSecretCodec codec = new FulfillmentSecretCodec(
                "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8),
                "abcdef0123456789abcdef0123456789".getBytes(StandardCharsets.UTF_8),
                1,
                mapper);
        adminService = new FulfillmentAdminService(jdbc, codec, mapper);
        allocationService = new FulfillmentAllocationService(jdbc, mapper);
    }

    @Test
    void reservesOneInventoryItemIdempotentlyAndMarksItReadyAfterPayment() {
        long productId = insertProduct("fulfillment-allocation-test");
        adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.DISCORD_ACCOUNT,
                "DISCORD",
                1,
                0,
                java.util.List.of()), ACTOR);
        adminService.addInventory(productId, new FulfillmentInventoryWriteRequest(
                FulfillmentType.DISCORD_ACCOUNT,
                "DISCORD",
                Map.of("email", "allocation@example.test", "password", "synthetic-password"),
                Map.of()), ACTOR);

        long userId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.test', 'synthetic-customer', 'customer@example.test', 'Customer')
                RETURNING id
                """, Map.of(), Long.class);
        long orderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-allocation-test-key')
                RETURNING id
                """, Map.of("userId", userId), Long.class);
        long orderItemId = jdbc.queryForObject("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (:orderId, :productId, 'fulfillment-allocation-test', 'ทดสอบ', 'Test', 1000, 1)
                RETURNING id
                """, Map.of("orderId", orderId, "productId", productId), Long.class);

        allocationService.reserveForPendingOrder(orderId);
        allocationService.reserveForPendingOrder(orderId);

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_fulfillment_allocations WHERE order_fulfillment_id IN (SELECT id FROM order_fulfillments WHERE order_item_id = :orderItemId)",
                Map.of("orderItemId", orderItemId), Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM digital_inventory_items WHERE product_id = :productId",
                Map.of("productId", productId), String.class)).isEqualTo("RESERVED");

        allocationService.markOrderPaid(orderId);

        assertThat(jdbc.queryForObject(
                "SELECT status FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), String.class)).isEqualTo("READY");
    }

    @Test
    void releasesReservedInventoryExactlyOnce() {
        long productId = insertProduct("fulfillment-release-test");
        adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.LICENSE_KEY, "SYNTHETIC", 1, 0, java.util.List.of()), ACTOR);
        FulfillmentInventoryResponse inventory = adminService.addInventory(productId,
                new FulfillmentInventoryWriteRequest(
                        FulfillmentType.LICENSE_KEY,
                        "SYNTHETIC",
                        Map.of("licenseKey", "release-license"),
                        Map.of()), ACTOR);
        long userId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.test', 'release-customer', 'release@example.test', 'Customer')
                RETURNING id
                """, Map.of(), Long.class);
        long orderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-release-test-key')
                RETURNING id
                """, Map.of("userId", userId), Long.class);
        long orderItemId = jdbc.queryForObject("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (:orderId, :productId, 'fulfillment-release-test', 'ทดสอบ', 'Test', 1000, 1)
                RETURNING id
                """, Map.of("orderId", orderId, "productId", productId), Long.class);

        allocationService.reserveForPendingOrder(orderId);
        allocationService.releaseForOrder(orderId);
        allocationService.releaseForOrder(orderId);

        assertThat(jdbc.queryForObject(
                "SELECT status FROM digital_inventory_items WHERE id = :inventoryId",
                Map.of("inventoryId", inventory.id()), String.class)).isEqualTo("AVAILABLE");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM order_fulfillment_allocations WHERE inventory_item_id = :inventoryId",
                Map.of("inventoryId", inventory.id()), String.class)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), String.class)).isEqualTo("RELEASED");
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM fulfillment_audit_log
                WHERE inventory_item_id = :inventoryId AND action = 'RELEASE'
                """, Map.of("inventoryId", inventory.id()), Long.class)).isEqualTo(1L);

        long secondUserId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.test', 'release-customer-second', 'release-second@example.test', 'Customer')
                RETURNING id
                """, Map.of(), Long.class);
        long secondOrderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-release-test-second-key')
                RETURNING id
                """, Map.of("userId", secondUserId), Long.class);
        jdbc.update("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (:orderId, :productId, 'fulfillment-release-test', 'ทดสอบ', 'Test', 1000, 1)
                """, Map.of("orderId", secondOrderId, "productId", productId));

        allocationService.reserveForPendingOrder(secondOrderId);

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM order_fulfillment_allocations WHERE inventory_item_id = :inventoryId",
                Map.of("inventoryId", inventory.id()), Long.class)).isEqualTo(2L);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM digital_inventory_items WHERE id = :inventoryId",
                Map.of("inventoryId", inventory.id()), String.class)).isEqualTo("RESERVED");
 }

 @Test
 void refusesToRevokeInventoryReservedForPendingPayment() {
 long productId = insertProduct("fulfillment-reserved-revoke-test");
 adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
         FulfillmentType.LICENSE_KEY, "SYNTHETIC", 1, 0, java.util.List.of()), ACTOR);
 FulfillmentInventoryResponse inventory = adminService.addInventory(productId,
         new FulfillmentInventoryWriteRequest(
                 FulfillmentType.LICENSE_KEY,
                 "SYNTHETIC",
                 Map.of("licenseKey", "reserved-revoke-license"),
                 Map.of()), ACTOR);
 long userId = jdbc.queryForObject("""
 INSERT INTO app_users (issuer, subject, email, display_name)
 VALUES ('https://issuer.test', 'reserved-revoke-customer', 'reserved-revoke@example.test', 'Customer')
 RETURNING id
 """, Map.of(), Long.class);
 long orderId = jdbc.queryForObject("""
 INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
 VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-reserved-revoke-key')
 RETURNING id
 """, Map.of("userId", userId), Long.class);
 jdbc.update("""
 INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
 VALUES (:orderId, :productId, 'fulfillment-reserved-revoke-test', 'ทดสอบ', 'Test', 1000, 1)
 """, Map.of("orderId", orderId, "productId", productId));
 allocationService.reserveForPendingOrder(orderId);

 assertThatThrownBy(() -> adminService.revokeInventory(
         productId, inventory.id(), ACTOR, "INCIDENT_RESPONSE"))
         .isInstanceOf(FulfillmentConflictException.class);

 assertThat(jdbc.queryForObject(
         "SELECT status FROM digital_inventory_items WHERE id = :inventoryId",
         Map.of("inventoryId", inventory.id()), String.class)).isEqualTo("RESERVED");
 assertThat(jdbc.queryForObject(
         "SELECT status FROM order_fulfillment_allocations WHERE inventory_item_id = :inventoryId",
         Map.of("inventoryId", inventory.id()), String.class)).isEqualTo("RESERVED");
 }

 @Test
 void keepsManualDeliveryWaitingForOperatorAfterPayment() {
 long productId = insertProduct("fulfillment-manual-test", "MANUAL");
 adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
 FulfillmentType.LICENSE_KEY, "SYNTHETIC", 1, 0, java.util.List.of()), ACTOR);
 adminService.addInventory(productId, new FulfillmentInventoryWriteRequest(
 FulfillmentType.LICENSE_KEY,
 "SYNTHETIC",
 Map.of("licenseKey", "manual-license"),
 Map.of()), ACTOR);
 long userId = jdbc.queryForObject("""
 INSERT INTO app_users (issuer, subject, email, display_name)
 VALUES ('https://issuer.test', 'manual-customer', 'manual@example.test', 'Customer')
 RETURNING id
 """, Map.of(), Long.class);
 long orderId = jdbc.queryForObject("""
 INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
 VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-manual-test-key')
 RETURNING id
 """, Map.of("userId", userId), Long.class);
 long orderItemId = jdbc.queryForObject("""
 INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
 VALUES (:orderId, :productId, 'fulfillment-manual-test', 'ทดสอบ', 'Test', 1000, 1)
 RETURNING id
 """, Map.of("orderId", orderId, "productId", productId), Long.class);

 allocationService.reserveForPendingOrder(orderId);
 jdbc.update("UPDATE shop_orders SET status = 'PAID' WHERE id = :orderId", Map.of("orderId", orderId));
 allocationService.markOrderPaid(orderId);

 assertThat(jdbc.queryForObject(
         "SELECT status FROM order_fulfillments WHERE order_item_id = :orderItemId",
         Map.of("orderItemId", orderItemId), String.class)).isEqualTo("RESERVED");
 long fulfillmentId = jdbc.queryForObject(
         "SELECT id FROM order_fulfillments WHERE order_item_id = :orderItemId",
         Map.of("orderItemId", orderItemId), Long.class);
 assertThat(adminService.markManualReady(fulfillmentId, ACTOR).status())
         .isEqualTo(OrderFulfillmentStatus.READY);
 }

 private static long insertProduct(String slug) {
 return insertProduct(slug, "INSTANT");
 }

 private static long insertProduct(String slug, String deliveryType) {
        return jdbc.queryForObject("""
                INSERT INTO products (
                    slug, name_th, name_en, description_th, description_en,
                    selection_mode, price_minor, currency, stock_quantity,
                    instant_delivery, catalog_order,
                    short_description_th, short_description_en, delivery_type,
                    warranty_days, stock_warning_threshold, status, sort_order,
                    active, updated_by, version
                ) VALUES (
                    :slug, 'ทดสอบ', 'Test', 'คำอธิบาย', 'Description',
                    'SINGLE_OPTION', 1000, 'THB', 0,
                    :instantDelivery, :catalogOrder,
                    'สั้น', 'Short', :deliveryType,
                    0, 0, 'ACTIVE', :catalogOrder,
                    TRUE, 'synthetic-admin', 0
                )
                RETURNING id
                """, Map.of(
                        "slug", slug,
                        "catalogOrder", CATALOG_ORDER.incrementAndGet(),
                        "deliveryType", deliveryType,
                        "instantDelivery", !"MANUAL".equals(deliveryType)), Long.class);
    }
}
