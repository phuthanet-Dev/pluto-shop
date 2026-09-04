package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.oauth2.jwt.Jwt;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import com.plutoshop.api.admin.AdminProductService;

import tools.jackson.databind.ObjectMapper;

@Testcontainers
class FulfillmentCustomerServiceIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    private static NamedParameterJdbcTemplate jdbc;
    private static FulfillmentAdminService adminService;
    private static FulfillmentCustomerService customerService;
    private static FulfillmentAllocationService allocationService;
    private static FulfillmentDeliveryService deliveryService;
    private static final AtomicInteger CATALOG_ORDER = new AtomicInteger(12_000);
    private static final AdminProductService.AdminActor ACTOR =
            new AdminProductService.AdminActor("https://issuer.test", "synthetic-admin");
    private static final Jwt CUSTOMER_JWT = Jwt.withTokenValue("synthetic-customer-token")
            .header("alg", "none")
            .issuer("https://issuer.test")
            .subject("synthetic-customer")
            .build();

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
        customerService = new FulfillmentCustomerService(jdbc, codec, mapper);
        deliveryService = new FulfillmentDeliveryService(jdbc, codec, mapper);
    }

    @Test
    void onlyOrderOwnerCanRevealPaidFulfillmentAndRevealMarksAllocationDelivered() {
        long productId = insertProduct("fulfillment-customer-test");
        adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.DISCORD_ACCOUNT,
                "DISCORD",
                1,
                0,
                List.of(
                        new FulfillmentStepRequest(1, FulfillmentAudience.CUSTOMER,
                                "เข้าสู่ระบบ", "Sign in",
                                "ใช้ข้อมูลที่ได้รับ", "Use the delivered data", null, true),
                        new FulfillmentStepRequest(1, FulfillmentAudience.OPERATOR,
                                "ตรวจสอบ", "Review",
                                "ห้ามส่งขั้นตอนนี้ให้ลูกค้า", "Do not expose this step", null, true))),
                ACTOR);
        adminService.addInventory(productId, new FulfillmentInventoryWriteRequest(
                FulfillmentType.DISCORD_ACCOUNT,
                "DISCORD",
                Map.of("email", "customer@example.test", "password", "synthetic-password"),
                Map.of()), ACTOR);

        long userId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.test', 'synthetic-customer', 'customer@example.test', 'Customer')
                RETURNING id
                """, Map.of(), Long.class);
        long orderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, 'fulfillment-customer-test-key')
                RETURNING id
                """, Map.of("userId", userId), Long.class);
        long orderItemId = jdbc.queryForObject("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (:orderId, :productId, 'fulfillment-customer-test', 'ทดสอบ', 'Test', 1000, 1)
                RETURNING id
                """, Map.of("orderId", orderId, "productId", productId), Long.class);
        allocationService.reserveForPendingOrder(orderId);
        jdbc.update("UPDATE shop_orders SET status = 'PAID' WHERE id = :orderId", Map.of("orderId", orderId));
        allocationService.markOrderPaid(orderId);
        assertThat(deliveryService.processDue(10)).isEqualTo(1);
        assertThat(deliveryService.processDue(10)).isZero();
        String snapshot = jdbc.queryForObject(
                "SELECT instructions_snapshot::text FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), String.class);
        assertThat(snapshot).doesNotContain("synthetic-password", "Do not expose this step");

        CustomerFulfillmentResponse beforeReveal = customerService.getOrderFulfillment(CUSTOMER_JWT, orderId);
        assertThat(beforeReveal.lines()).hasSize(1);
        assertThat(beforeReveal.lines().get(0).revealAvailable()).isTrue();
        assertThat(beforeReveal.lines().get(0).customerSteps()).hasSize(1);
        assertThat(beforeReveal.lines().get(0).customerSteps().get(0).audience())
                .isEqualTo(FulfillmentAudience.CUSTOMER);

        Jwt otherCustomer = Jwt.withTokenValue("synthetic-other-token")
                .header("alg", "none")
                .issuer("https://issuer.test")
                .subject("synthetic-other")
                .build();
        assertThatThrownBy(() -> customerService.getOrderFulfillment(otherCustomer, orderId))
                .isInstanceOf(FulfillmentNotFoundException.class);

        FulfillmentRevealResponse revealed = customerService.reveal(
                CUSTOMER_JWT, orderId, orderItemId);
        assertThat(revealed.fields())
                .containsEntry("email", "customer@example.test")
                .containsEntry("password", "synthetic-password");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM digital_inventory_items WHERE product_id = :productId",
                Map.of("productId", productId), String.class)).isEqualTo("DELIVERED");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), String.class)).isEqualTo("DELIVERED");

        assertThat(customerService.reveal(CUSTOMER_JWT, orderId, orderItemId).fields())
                .containsEntry("password", "synthetic-password");
    }

    @Test
    void deliveryFailureIsRetryableWithoutChangingPaidOrder() {
        String suffix = Long.toString(System.nanoTime());
        String slug = "fulfillment-delivery-failure-" + suffix;
        long productId = insertProduct(slug);
        adminService.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.LICENSE_KEY,
                "LICENSE",
                1,
                0,
                List.of()),
                ACTOR);
        adminService.addInventory(productId, new FulfillmentInventoryWriteRequest(
                FulfillmentType.LICENSE_KEY,
                "LICENSE",
                Map.of("licenseKey", "synthetic-license-" + suffix),
                Map.of()), ACTOR);

        String subject = "synthetic-failure-" + suffix;
        long userId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.test', :subject, :email, 'Failure Customer')
                RETURNING id
                """, Map.of("subject", subject, "email", subject + "@example.test"), Long.class);
        long orderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, 'PAYMENT_PENDING', 'PROMPTPAY', 'THB', 1000, :idempotencyKey)
                RETURNING id
                """, Map.of("userId", userId, "idempotencyKey", "failure-key-" + suffix), Long.class);
        long orderItemId = jdbc.queryForObject("""
                INSERT INTO shop_order_items (order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity)
                VALUES (:orderId, :productId, :slug, 'ทดสอบ', 'Test', 1000, 1)
                RETURNING id
                """, Map.of("orderId", orderId, "productId", productId, "slug", slug), Long.class);
        allocationService.reserveForPendingOrder(orderId);
        jdbc.update("UPDATE shop_orders SET status = 'PAID' WHERE id = :orderId", Map.of("orderId", orderId));
        allocationService.markOrderPaid(orderId);
        jdbc.update("""
                UPDATE digital_inventory_items
                SET secret_ciphertext = decode('00', 'hex')
                WHERE product_id = :productId
                """, Map.of("productId", productId));

        assertThat(deliveryService.processDue(10)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT status FROM shop_orders WHERE id = :orderId",
                Map.of("orderId", orderId), String.class)).isEqualTo("PAID");
        assertThat(jdbc.queryForObject(
                "SELECT status FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), String.class)).isEqualTo("FAILED");
        assertThat(jdbc.queryForObject(
                "SELECT retry_count FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT next_attempt_at FROM order_fulfillments WHERE order_item_id = :orderItemId",
                Map.of("orderItemId", orderItemId), Object.class)).isNotNull();
    }

    private static long insertProduct(String slug) {
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
                    TRUE, :catalogOrder,
                    'สั้น', 'Short', 'INSTANT',
                    0, 0, 'ACTIVE', :catalogOrder,
                    TRUE, 'synthetic-admin', 0
                )
                RETURNING id
                """, Map.of(
                        "slug", slug,
                        "catalogOrder", CATALOG_ORDER.incrementAndGet()), Long.class);
    }
}
