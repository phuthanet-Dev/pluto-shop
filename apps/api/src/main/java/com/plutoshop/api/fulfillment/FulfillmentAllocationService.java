package com.plutoshop.api.fulfillment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;
import tools.jackson.databind.ObjectMapper;

@Service
public class FulfillmentAllocationService {

    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public FulfillmentAllocationService(
            @Qualifier("userJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public void reserveForPendingOrder(long orderId) {
        ensureOrder(orderId);
        List<OrderItemRow> items = jdbc.query("""
                SELECT oi.id AS order_item_id,
                       oi.product_id,
                       oi.quantity,
                       p.delivery_type,
                       COALESCE(fp.fulfillment_type, 'NONE') AS fulfillment_type
                FROM shop_order_items oi
                JOIN products p ON p.id = oi.product_id
                LEFT JOIN product_fulfillment_profiles fp ON fp.product_id = oi.product_id
                WHERE oi.order_id = :orderId
                ORDER BY oi.id
                FOR UPDATE OF oi
                """, Map.of("orderId", orderId), this::mapOrderItem);

        for (OrderItemRow item : items) {
            if (item.fulfillmentType() == FulfillmentType.NONE) {
                continue;
            }
            if (findFulfillment(item.orderItemId()).isPresent()) {
                continue;
            }
            if (item.fulfillmentType().requiresSecurePayload() && item.quantity() != 1) {
                throw new FulfillmentConflictException(
                        "Secure fulfillment supports one unit per order item");
            }

            long fulfillmentId = nextId("order_fulfillments");
            String status = item.fulfillmentType().requiresSecurePayload()
                    ? OrderFulfillmentStatus.RESERVED.name()
                    : OrderFulfillmentStatus.PENDING.name();
            jdbc.update("""
                    INSERT INTO order_fulfillments (
                        id, order_item_id, product_id, fulfillment_type, delivery_type,
                        status, instructions_snapshot
                    ) VALUES (
                        :id, :orderItemId, :productId, :fulfillmentType, :deliveryType,
                        :status, CAST(:instructions AS jsonb)
                    )
                    """, new MapSqlParameterSource()
                    .addValue("id", fulfillmentId)
                    .addValue("orderItemId", item.orderItemId())
                    .addValue("productId", item.productId())
                    .addValue("fulfillmentType", item.fulfillmentType().name())
                    .addValue("deliveryType", item.deliveryType())
                    .addValue("status", status)
                    .addValue("instructions", customerStepsSnapshot(item.productId())));

            if (item.fulfillmentType().requiresSecurePayload()) {
                reserveInventory(fulfillmentId, item);
            }
        }
    }

    @Transactional
    public void markOrderPaid(long orderId) {
        ensureOrder(orderId);
        List<FulfillmentIdRow> fulfillments = jdbc.query("""
                SELECT f.id, f.product_id
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                WHERE oi.order_id = :orderId
                  AND f.status IN ('RESERVED', 'PENDING')
                  AND f.delivery_type = 'INSTANT'
                ORDER BY f.id
                FOR UPDATE OF f
                """, Map.of("orderId", orderId),
                (rs, rowNum) -> new FulfillmentIdRow(rs.getLong("id"), rs.getLong("product_id")));

        for (FulfillmentIdRow fulfillment : fulfillments) {
            int updated = jdbc.update("""
                    UPDATE order_fulfillments
                    SET status = 'READY', updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :id AND status IN ('RESERVED', 'PENDING')
                    """, Map.of("id", fulfillment.id()));
            if (updated == 1) {
                writeAudit(
                        fulfillment.productId(),
                        fulfillment.id(),
                        null,
                        "ASSIGN",
                        Map.of("status", OrderFulfillmentStatus.READY.name()));
            }
        }
    }

    @Transactional
    public void releaseForOrder(long orderId) {
        ensureOrder(orderId);
        List<AllocationRow> allocations = jdbc.query("""
                SELECT a.id AS allocation_id,
                       a.inventory_item_id,
                       f.product_id,
                       f.id AS fulfillment_id
                FROM order_fulfillment_allocations a
                JOIN order_fulfillments f ON f.id = a.order_fulfillment_id
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                WHERE oi.order_id = :orderId AND a.status = 'RESERVED'
                ORDER BY a.id
                FOR UPDATE OF a
                """, Map.of("orderId", orderId), this::mapAllocation);

        for (AllocationRow allocation : allocations) {
            int inventoryUpdated = jdbc.update("""
                    UPDATE digital_inventory_items
                    SET status = 'AVAILABLE', reserved_until = NULL,
                        updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :inventoryItemId AND status = 'RESERVED'
                    """, Map.of("inventoryItemId", allocation.inventoryItemId()));
            if (inventoryUpdated != 1) {
                throw new FulfillmentConflictException("Reserved inventory is no longer releasable");
            }
            int allocationUpdated = jdbc.update("""
                    UPDATE order_fulfillment_allocations
                    SET status = 'RELEASED', released_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :allocationId AND status = 'RESERVED'
                    """, Map.of("allocationId", allocation.allocationId()));
            if (allocationUpdated != 1) {
                throw new FulfillmentConflictException("Fulfillment allocation is no longer releasable");
            }
            writeAudit(
                    allocation.productId(),
                    allocation.fulfillmentId(),
                    allocation.inventoryItemId(),
                    "RELEASE",
                    Map.of("status", FulfillmentAllocationStatus.RELEASED.name()));
        }

        List<FulfillmentIdRow> pendingFulfillments = jdbc.query("""
                SELECT f.id, f.product_id
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                WHERE oi.order_id = :orderId AND f.status IN ('RESERVED', 'PENDING')
                ORDER BY f.id
                FOR UPDATE OF f
                """, Map.of("orderId", orderId),
                (rs, rowNum) -> new FulfillmentIdRow(rs.getLong("id"), rs.getLong("product_id")));
        for (FulfillmentIdRow fulfillment : pendingFulfillments) {
            jdbc.update("""
                    UPDATE order_fulfillments
                    SET status = 'RELEASED', updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :id AND status IN ('RESERVED', 'PENDING')
                    """, Map.of("id", fulfillment.id()));
            writeAudit(
                    fulfillment.productId(),
                    fulfillment.id(),
                    null,
                    "RELEASE",
                    Map.of("status", OrderFulfillmentStatus.RELEASED.name()));
        }
    }

    private void reserveInventory(long fulfillmentId, OrderItemRow item) {
        List<Long> inventoryIds = jdbc.query("""
                SELECT id
                FROM digital_inventory_items
                WHERE product_id = :productId
                  AND fulfillment_type = :fulfillmentType
                  AND status = 'AVAILABLE'
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                ORDER BY id
                FOR UPDATE SKIP LOCKED
                LIMIT :quantity
                """, new MapSqlParameterSource()
                .addValue("productId", item.productId())
                .addValue("fulfillmentType", item.fulfillmentType().name())
                .addValue("quantity", item.quantity()),
                (rs, rowNum) -> rs.getLong("id"));

        if (inventoryIds.size() != item.quantity()) {
            throw new FulfillmentConflictException("Fulfillment inventory is unavailable");
        }
        for (int index = 0; index < inventoryIds.size(); index++) {
            long inventoryId = inventoryIds.get(index);
            int updated = jdbc.update("""
                    UPDATE digital_inventory_items
                    SET status = 'RESERVED', reserved_until = NULL,
                        updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :inventoryItemId AND status = 'AVAILABLE'
                    """, Map.of("inventoryItemId", inventoryId));
            if (updated != 1) {
                throw new FulfillmentConflictException("Fulfillment inventory is no longer available");
            }
            try {
                jdbc.update("""
                        INSERT INTO order_fulfillment_allocations (
                            order_fulfillment_id, inventory_item_id, unit_index, status
                        ) VALUES (:fulfillmentId, :inventoryItemId, :unitIndex, 'RESERVED')
                        """, Map.of(
                        "fulfillmentId", fulfillmentId,
                        "inventoryItemId", inventoryId,
                        "unitIndex", index + 1));
            } catch (DataIntegrityViolationException exception) {
                throw new FulfillmentConflictException("Fulfillment inventory allocation conflicted");
            }
            writeAudit(
                    item.productId(),
                    fulfillmentId,
                    inventoryId,
                    "RESERVE",
                    Map.of("unitIndex", index + 1));
        }
    }

    private Optional<Long> findFulfillment(long orderItemId) {
        List<Long> ids = jdbc.query("""
                SELECT id FROM order_fulfillments WHERE order_item_id = :orderItemId
                """, Map.of("orderItemId", orderItemId),
                (rs, rowNum) -> rs.getLong("id"));
        return ids.stream().findFirst();
    }

    private String customerStepsSnapshot(long productId) {
        ArrayNode snapshot = objectMapper.createArrayNode();
        jdbc.query("""
                SELECT id, step_order, audience, title_th, title_en, body_th, body_en, link_url, enabled
                FROM product_fulfillment_steps
                WHERE product_id = :productId AND audience = 'CUSTOMER' AND enabled = TRUE
                ORDER BY step_order
                """, Map.of("productId", productId), rs -> {
            ObjectNode step = snapshot.addObject();
            step.put("id", rs.getLong("id"));
            step.put("stepOrder", rs.getInt("step_order"));
            step.put("audience", rs.getString("audience"));
            step.put("titleTh", rs.getString("title_th"));
            step.put("titleEn", rs.getString("title_en"));
            step.put("bodyTh", rs.getString("body_th"));
            step.put("bodyEn", rs.getString("body_en"));
            if (rs.getString("link_url") == null) {
                step.putNull("linkUrl");
            } else {
                step.put("linkUrl", rs.getString("link_url"));
            }
            step.put("enabled", rs.getBoolean("enabled"));
        });
        try {
            return objectMapper.writeValueAsString(snapshot);
        } catch (RuntimeException exception) {
            throw new FulfillmentSecretException("Unable to snapshot fulfillment instructions", exception);
        }
    }

    private void ensureOrder(long orderId) {
        if (orderId <= 0) {
            throw new FulfillmentNotFoundException("Order not found");
        }
        Long count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shop_orders WHERE id = :orderId",
                Map.of("orderId", orderId), Long.class);
        if (count == null || count == 0) {
            throw new FulfillmentNotFoundException("Order not found");
        }
    }

    private long nextId(String table) {
        String sequence = switch (table) {
            case "order_fulfillments" -> "order_fulfillments_id_seq";
            default -> throw new IllegalArgumentException("Unsupported fulfillment sequence");
        };
        Long id = jdbc.queryForObject("SELECT nextval('" + sequence + "')", Map.of(), Long.class);
        if (id == null) {
            throw new FulfillmentSecretException("Unable to allocate fulfillment identifier");
        }
        return id;
    }

    private void writeAudit(
            Long productId,
            Long fulfillmentId,
            Long inventoryId,
            String action,
            Map<String, ?> metadata) {
        ObjectNode json = objectMapper.createObjectNode();
        metadata.forEach((key, value) -> {
            if (value instanceof Number number) {
                json.put(key, number.longValue());
            } else {
                json.put(key, String.valueOf(value));
            }
        });
        jdbc.update("""
                INSERT INTO fulfillment_audit_log (
                    product_id, order_fulfillment_id, inventory_item_id, action, metadata_jsonb
                ) VALUES (
                    :productId, :fulfillmentId, :inventoryId, :action, CAST(:metadata AS jsonb)
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("inventoryId", inventoryId)
                .addValue("action", action)
                .addValue("metadata", objectMapper.writeValueAsString(json)));
    }

    private OrderItemRow mapOrderItem(ResultSet rs, int rowNumber) throws SQLException {
        return new OrderItemRow(
                rs.getLong("order_item_id"),
                rs.getLong("product_id"),
                rs.getInt("quantity"),
                rs.getString("delivery_type"),
                FulfillmentType.valueOf(rs.getString("fulfillment_type")));
    }

    private AllocationRow mapAllocation(ResultSet rs, int rowNumber) throws SQLException {
        return new AllocationRow(
                rs.getLong("allocation_id"),
                rs.getLong("inventory_item_id"),
                rs.getLong("product_id"),
                rs.getLong("fulfillment_id"));
    }

    private record OrderItemRow(
            long orderItemId,
            long productId,
            int quantity,
            String deliveryType,
            FulfillmentType fulfillmentType) {
    }

    private record FulfillmentIdRow(long id, long productId) {
    }

    private record AllocationRow(
            long allocationId,
            long inventoryItemId,
            long productId,
            long fulfillmentId) {
    }
}
