package com.plutoshop.api.fulfillment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.List;
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
class FulfillmentAdminManualServiceIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");
    private static final AdminProductService.AdminActor ACTOR =
            new AdminProductService.AdminActor("https://issuer.example.test", "synthetic-admin");
    private static final AtomicInteger IDS = new AtomicInteger(20_000);

    private static NamedParameterJdbcTemplate jdbc;
    private static FulfillmentAdminService service;

    @BeforeAll
    static void setUpDatabase() {
        POSTGRES.start();
        jdbc = new NamedParameterJdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_user NOLOGIN");
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_admin NOLOGIN");
        jdbc.getJdbcTemplate().execute("CREATE ROLE pluto_inspector NOLOGIN");
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .load()
                .migrate();
        ObjectMapper mapper = new ObjectMapper();
        FulfillmentSecretCodec codec = new FulfillmentSecretCodec(
                "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.UTF_8),
                "abcdef0123456789abcdef0123456789".getBytes(StandardCharsets.UTF_8),
                1,
                mapper);
        service = new FulfillmentAdminService(jdbc, codec, mapper);
    }

    @Test
    void listsOnlyPaidManualWorkWithOptionalStatusFilter() {
        FulfillmentFixture pendingInstruction = insertManualInstruction("PAID", "PENDING");
        FulfillmentFixture readyInstruction = insertManualInstruction("PAID", "READY");
        insertManualInstruction("PAYMENT_PENDING", "PENDING");
        insertFulfillment("PAID", "INSTANT", FulfillmentType.MANUAL_INSTRUCTION, "READY");

        List<FulfillmentAdminOrderResponse> queue = service.listManualFulfillments(null);
        List<FulfillmentAdminOrderResponse> ready =
                service.listManualFulfillments(OrderFulfillmentStatus.READY);

        assertThat(queue).extracting(FulfillmentAdminOrderResponse::fulfillmentId)
                .contains(pendingInstruction.fulfillmentId(), readyInstruction.fulfillmentId());
        assertThat(queue).allMatch(item -> "MANUAL".equals(item.deliveryType()));
        assertThat(ready).extracting(FulfillmentAdminOrderResponse::fulfillmentId)
                .contains(readyInstruction.fulfillmentId())
                .doesNotContain(pendingInstruction.fulfillmentId());
    }

    @Test
    void deliversPaidManualInstructionExactlyOnce() {
        FulfillmentFixture fixture = insertManualInstruction("PAID", "READY");

        FulfillmentAdminOrderResponse delivered = service.deliverManual(fixture.fulfillmentId(), ACTOR);
        FulfillmentAdminOrderResponse repeated = service.deliverManual(fixture.fulfillmentId(), ACTOR);

        assertThat(delivered.status()).isEqualTo(OrderFulfillmentStatus.DELIVERED);
        assertThat(repeated.status()).isEqualTo(OrderFulfillmentStatus.DELIVERED);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM fulfillment_audit_log
                WHERE order_fulfillment_id = :fulfillmentId AND action = 'DELIVER'
                """, Map.of("fulfillmentId", fixture.fulfillmentId()), Long.class)).isEqualTo(1L);
        Map<String, Object> audit = jdbc.queryForMap("""
                SELECT actor_issuer, actor_subject, metadata_jsonb::text AS metadata
                FROM fulfillment_audit_log
                WHERE order_fulfillment_id = :fulfillmentId AND action = 'DELIVER'
                """, Map.of("fulfillmentId", fixture.fulfillmentId()));
        assertThat(audit.get("actor_issuer")).isEqualTo("https://issuer.example.test");
        assertThat(audit.get("actor_subject")).isEqualTo("synthetic-admin");
        assertThat(audit.get("metadata").toString())
                .contains("DELIVERED", "MANUAL")
                .doesNotContain("password", "secret", "token");
    }

    @Test
    void deliversReservedSecureAllocationWithManualFulfillment() {
        FulfillmentFixture fixture = insertSecureManualReady();

        FulfillmentAdminOrderResponse delivered = service.deliverManual(fixture.fulfillmentId(), ACTOR);

        assertThat(delivered.status()).isEqualTo(OrderFulfillmentStatus.DELIVERED);
        assertThat(jdbc.queryForObject("""
                SELECT status FROM order_fulfillment_allocations
                WHERE order_fulfillment_id = :fulfillmentId
                """, Map.of("fulfillmentId", fixture.fulfillmentId()), String.class)).isEqualTo("DELIVERED");
        assertThat(jdbc.queryForObject("""
                SELECT d.status FROM digital_inventory_items d
                JOIN order_fulfillment_allocations a ON a.inventory_item_id = d.id
                WHERE a.order_fulfillment_id = :fulfillmentId
                """, Map.of("fulfillmentId", fixture.fulfillmentId()), String.class)).isEqualTo("DELIVERED");
    }

    @Test
    void refusesUnpaidNonManualAndInvalidStateWithoutMutation() {
        FulfillmentFixture unpaid = insertManualInstruction("PAYMENT_PENDING", "READY");
        FulfillmentFixture instant = insertFulfillment(
                "PAID", "INSTANT", FulfillmentType.MANUAL_INSTRUCTION, "READY");
        FulfillmentFixture pending = insertManualInstruction("PAID", "PENDING");

        assertThatThrownBy(() -> service.deliverManual(unpaid.fulfillmentId(), ACTOR))
                .isInstanceOf(FulfillmentConflictException.class);
        assertThatThrownBy(() -> service.deliverManual(instant.fulfillmentId(), ACTOR))
                .isInstanceOf(FulfillmentConflictException.class);
        assertThatThrownBy(() -> service.deliverManual(pending.fulfillmentId(), ACTOR))
                .isInstanceOf(FulfillmentConflictException.class);
        assertThat(jdbc.queryForObject("""
                SELECT status FROM order_fulfillments WHERE id = :fulfillmentId
                """, Map.of("fulfillmentId", pending.fulfillmentId()), String.class)).isEqualTo("PENDING");
    }

    private static FulfillmentFixture insertSecureManualReady() {
        int suffix = IDS.incrementAndGet();
        long productId = insertProduct("manual-secure-" + suffix, "MANUAL");
        service.updateProfile(productId, new FulfillmentProfileWriteRequest(
                FulfillmentType.LICENSE_KEY, "SYNTHETIC", 1, 0, List.of()), ACTOR);
        FulfillmentInventoryResponse inventory = service.addInventory(productId,
                new FulfillmentInventoryWriteRequest(
                        FulfillmentType.LICENSE_KEY,
                        "SYNTHETIC",
                        Map.of("licenseKey", "synthetic-manual-license-" + suffix),
                        Map.of()),
                ACTOR);
        FulfillmentFixture fixture = insertOrderFulfillment(
                productId, "PAID", "MANUAL", FulfillmentType.LICENSE_KEY, "READY", suffix);
        jdbc.update("""
                UPDATE digital_inventory_items
                SET status = 'RESERVED', version = version + 1
                WHERE id = :inventoryId AND status = 'AVAILABLE'
                """, Map.of("inventoryId", inventory.id()));
        jdbc.update("""
                INSERT INTO order_fulfillment_allocations (
                    order_fulfillment_id, inventory_item_id, unit_index, status
                ) VALUES (:fulfillmentId, :inventoryId, 1, 'RESERVED')
                """, Map.of(
                        "fulfillmentId", fixture.fulfillmentId(),
                        "inventoryId", inventory.id()));
        return fixture;
    }

    private static FulfillmentFixture insertManualInstruction(String orderStatus, String fulfillmentStatus) {
        return insertFulfillment(
                orderStatus, "MANUAL", FulfillmentType.MANUAL_INSTRUCTION, fulfillmentStatus);
    }

    private static FulfillmentFixture insertFulfillment(
            String orderStatus,
            String deliveryType,
            FulfillmentType fulfillmentType,
            String fulfillmentStatus) {
        int suffix = IDS.incrementAndGet();
        long productId = insertProduct("manual-queue-" + suffix, deliveryType);
        return insertOrderFulfillment(
                productId, orderStatus, deliveryType, fulfillmentType, fulfillmentStatus, suffix);
    }

    private static FulfillmentFixture insertOrderFulfillment(
            long productId,
            String orderStatus,
            String deliveryType,
            FulfillmentType fulfillmentType,
            String fulfillmentStatus,
            int suffix) {
        long userId = jdbc.queryForObject("""
                INSERT INTO app_users (issuer, subject, email, display_name)
                VALUES ('https://issuer.example.test', :subject, :email, 'Synthetic customer')
                RETURNING id
                """, Map.of(
                        "subject", "manual-customer-" + suffix,
                        "email", "manual-customer-" + suffix + "@example.test"), Long.class);
        long orderId = jdbc.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (:userId, :status, 'PROMPTPAY', 'THB', 100, :key)
                RETURNING id
                """, Map.of(
                        "userId", userId,
                        "status", orderStatus,
                        "key", "manual-fulfillment-" + suffix), Long.class);
        long orderItemId = jdbc.queryForObject("""
                INSERT INTO shop_order_items (
                    order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity
                ) VALUES (
                    :orderId, :productId, :slug, 'สินค้าทดสอบ', 'Synthetic product', 100, 1
                ) RETURNING id
                """, Map.of(
                        "orderId", orderId,
                        "productId", productId,
                        "slug", "manual-order-item-" + suffix), Long.class);
        long fulfillmentId = jdbc.queryForObject("""
                INSERT INTO order_fulfillments (
                    order_item_id, product_id, fulfillment_type, delivery_type, status
                ) VALUES (
                    :orderItemId, :productId, :fulfillmentType, :deliveryType, :status
                ) RETURNING id
                """, Map.of(
                        "orderItemId", orderItemId,
                        "productId", productId,
                        "fulfillmentType", fulfillmentType.name(),
                        "deliveryType", deliveryType,
                        "status", fulfillmentStatus), Long.class);
        return new FulfillmentFixture(fulfillmentId);
    }

    private static long insertProduct(String slug, String deliveryType) {
        int catalogOrder = IDS.incrementAndGet();
        return jdbc.queryForObject("""
                INSERT INTO products (
                    slug, name_th, name_en, description_th, description_en,
                    selection_mode, price_minor, currency, stock_quantity,
                    instant_delivery, catalog_order,
                    short_description_th, short_description_en, delivery_type,
                    warranty_days, stock_warning_threshold, status, sort_order,
                    active, updated_by, version
                ) VALUES (
                    :slug, 'สินค้าทดสอบ', 'Synthetic product', 'ทดสอบ', 'Synthetic test',
                    'SINGLE_OPTION', 100, 'THB', 0,
                    :instantDelivery, :catalogOrder,
                    'ทดสอบ', 'Synthetic', :deliveryType,
                    0, 0, 'ACTIVE', :catalogOrder,
                    TRUE, 'synthetic-admin', 0
                ) RETURNING id
                """, Map.of(
                        "slug", slug,
                        "instantDelivery", "INSTANT".equals(deliveryType),
                        "catalogOrder", catalogOrder,
                        "deliveryType", deliveryType), Long.class);
    }

    private record FulfillmentFixture(long fulfillmentId) {
    }
}
