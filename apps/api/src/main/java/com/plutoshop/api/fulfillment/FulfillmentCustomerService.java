package com.plutoshop.api.fulfillment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Service
public class FulfillmentCustomerService {

    private final NamedParameterJdbcTemplate jdbc;
    private final FulfillmentSecretCodec secretCodec;
    private final ObjectMapper objectMapper;
    private final FulfillmentPayloadFactory payloadFactory;

    public FulfillmentCustomerService(
            @org.springframework.beans.factory.annotation.Qualifier("userJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            FulfillmentSecretCodec secretCodec,
            ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.secretCodec = secretCodec;
        this.objectMapper = objectMapper;
        this.payloadFactory = new FulfillmentPayloadFactory(new FulfillmentPayloadValidator());
    }

    @Transactional(readOnly = true)
    public CustomerFulfillmentResponse getOrderFulfillment(Jwt jwt, long orderId) {
        UserIdentity user = resolveUser(jwt);
        List<FulfillmentLineRow> rows = jdbc.query("""
                SELECT o.id AS order_id,
                       o.status AS order_status,
                       f.id AS fulfillment_id,
                       f.order_item_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.delivery_type,
                       f.status,
                       f.instructions_snapshot
                FROM shop_orders o
                JOIN shop_order_items oi ON oi.order_id = o.id
                LEFT JOIN order_fulfillments f ON f.order_item_id = oi.id
                WHERE o.id = :orderId AND o.user_id = :userId
                ORDER BY oi.id
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("userId", user.id()), this::mapFulfillmentLine);
        if (rows.isEmpty()) {
            throw new FulfillmentNotFoundException("Order fulfillment not found");
        }
        if (!"PAID".equals(rows.get(0).orderStatus())) {
            throw new FulfillmentConflictException("Order is not paid");
        }

        List<CustomerFulfillmentLineResponse> lines = new ArrayList<>();
        for (FulfillmentLineRow row : rows) {
            if (row.fulfillmentId() == null) {
                continue;
            }
            OrderFulfillmentStatus status = OrderFulfillmentStatus.valueOf(row.status());
            boolean revealAvailable = row.fulfillmentType().requiresSecurePayload()
                    && status == OrderFulfillmentStatus.DELIVERED;
            lines.add(new CustomerFulfillmentLineResponse(
                    row.orderItemId(),
                    row.productId(),
                    row.fulfillmentType(),
                    row.deliveryType(),
                    status,
                    revealAvailable,
                    parseCustomerSteps(row.instructionsSnapshot())));
        }
        return new CustomerFulfillmentResponse(rows.get(0).orderId(), rows.get(0).orderStatus(), lines);
    }

    @Transactional
    public FulfillmentRevealResponse reveal(Jwt jwt, long orderId, long orderItemId) {
        UserIdentity user = resolveUser(jwt);
        FulfillmentSecretRow fulfillment = jdbc.query("""
                SELECT o.id AS order_id,
                       o.status AS order_status,
                       f.id AS fulfillment_id,
                       f.order_item_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.status AS fulfillment_status,
                       d.id AS inventory_item_id,
                       d.provider,
                       d.payload_schema_version,
                       d.encryption_key_version,
                       d.secret_ciphertext,
                       d.secret_nonce,
                       d.secret_fingerprint,
                       a.id AS allocation_id,
                       a.status AS allocation_status
                FROM shop_orders o
                JOIN shop_order_items oi ON oi.order_id = o.id
                JOIN order_fulfillments f ON f.order_item_id = oi.id
                JOIN order_fulfillment_allocations a ON a.order_fulfillment_id = f.id
                JOIN digital_inventory_items d ON d.id = a.inventory_item_id
                WHERE o.id = :orderId
                  AND o.user_id = :userId
                  AND o.status = 'PAID'
                  AND oi.id = :orderItemId
                  AND f.status = 'DELIVERED'
                  AND a.status = 'DELIVERED'
                  AND d.status = 'DELIVERED'
                ORDER BY a.unit_index
                LIMIT 1
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("userId", user.id())
                .addValue("orderItemId", orderItemId), this::mapSecretRow)
                .stream()
                .findFirst()
                .orElseThrow(() -> new FulfillmentNotFoundException("Order fulfillment not found"));

        if (!fulfillment.fulfillmentType().requiresSecurePayload()) {
            throw new FulfillmentConflictException("This fulfillment has no revealable secret");
        }
        EncodedFulfillmentSecret encoded = new EncodedFulfillmentSecret(
                fulfillment.fulfillmentType(),
                fulfillment.provider(),
                fulfillment.payloadSchemaVersion(),
                fulfillment.encryptionKeyVersion(),
                fulfillment.ciphertext(),
                fulfillment.nonce(),
                fulfillment.fingerprint());
        FulfillmentPayload payload = secretCodec.decrypt(
                fulfillment.productId(),
                fulfillment.inventoryItemId(),
                fulfillment.provider(),
                encoded);
        Map<String, String> fields = payloadFactory.toFields(payload);

        writeAudit(
                fulfillment.productId(),
                fulfillment.fulfillmentId(),
                fulfillment.inventoryItemId(),
                "REVEAL",
                user);
        return new FulfillmentRevealResponse(
                fulfillment.inventoryItemId(),
                fulfillment.fulfillmentType(),
                fulfillment.provider(),
                fields);
    }


    private UserIdentity resolveUser(Jwt jwt) {
        if (jwt == null || jwt.getIssuer() == null || jwt.getSubject() == null) {
            throw new FulfillmentNotFoundException("Order fulfillment not found");
        }
        Long userId = jdbc.query("""
                SELECT id
                FROM app_users
                WHERE issuer = :issuer AND subject = :subject AND status = 'ACTIVE'
                """, new MapSqlParameterSource()
                .addValue("issuer", jwt.getIssuer().toString())
                .addValue("subject", jwt.getSubject()),
                (rs, rowNum) -> rs.getLong("id"))
                .stream()
                .findFirst()
                .orElseThrow(() -> new FulfillmentNotFoundException("Order fulfillment not found"));
        return new UserIdentity(userId, jwt.getIssuer().toString(), jwt.getSubject());
    }

    private List<FulfillmentStepResponse> parseCustomerSteps(String snapshotJson) {
        if (snapshotJson == null || snapshotJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode snapshot = objectMapper.readTree(snapshotJson);
            if (!snapshot.isArray()) {
                throw new FulfillmentSecretException("Fulfillment instructions are invalid");
            }
            List<FulfillmentStepResponse> steps = new ArrayList<>();
            for (JsonNode node : snapshot) {
                if (!node.isObject() || !"CUSTOMER".equals(text(node, "audience"))) {
                    continue;
                }
                steps.add(new FulfillmentStepResponse(
                        node.get("id").asLong(),
                        node.get("stepOrder").asInt(),
                        FulfillmentAudience.CUSTOMER,
                        text(node, "titleTh"),
                        text(node, "titleEn"),
                        text(node, "bodyTh"),
                        text(node, "bodyEn"),
                        nullableText(node, "linkUrl"),
                        node.get("enabled").asBoolean()));
            }
            return List.copyOf(steps);
        } catch (FulfillmentSecretException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw new FulfillmentSecretException("Fulfillment instructions are invalid", exception);
        }
    }

    private void writeAudit(
            long productId,
            long fulfillmentId,
            long inventoryItemId,
            String action,
            UserIdentity user) {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("deliveryView", "customer");
        jdbc.update("""
                INSERT INTO fulfillment_audit_log (
                    product_id, order_fulfillment_id, inventory_item_id, action,
                    actor_issuer, actor_subject, metadata_jsonb
                ) VALUES (
                    :productId, :fulfillmentId, :inventoryItemId, :action,
                    :issuer, :subject, CAST(:metadata AS jsonb)
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("inventoryItemId", inventoryItemId)
                .addValue("action", action)
                .addValue("issuer", user.issuer())
                .addValue("subject", user.subject())
                .addValue("metadata", objectMapper.writeValueAsString(metadata)));
    }

    private FulfillmentLineRow mapFulfillmentLine(ResultSet rs, int rowNumber) throws SQLException {
        String type = rs.getString("fulfillment_type");
        return new FulfillmentLineRow(
                rs.getLong("order_id"),
                rs.getString("order_status"),
                nullableLong(rs, "fulfillment_id"),
                rs.getLong("order_item_id"),
                rs.getLong("product_id"),
                type == null ? FulfillmentType.NONE : FulfillmentType.valueOf(type),
                rs.getString("delivery_type"),
                rs.getString("status"),
                rs.getString("instructions_snapshot"));
    }

    private FulfillmentSecretRow mapSecretRow(ResultSet rs, int rowNumber) throws SQLException {
        return new FulfillmentSecretRow(
                rs.getLong("order_id"),
                rs.getString("order_status"),
                rs.getLong("fulfillment_id"),
                rs.getLong("order_item_id"),
                rs.getLong("product_id"),
                FulfillmentType.valueOf(rs.getString("fulfillment_type")),
                rs.getString("fulfillment_status"),
                rs.getLong("inventory_item_id"),
                rs.getString("provider"),
                rs.getInt("payload_schema_version"),
                rs.getInt("encryption_key_version"),
                rs.getBytes("secret_ciphertext"),
                rs.getBytes("secret_nonce"),
                rs.getBytes("secret_fingerprint"),
                rs.getString("allocation_status"),
                rs.getLong("allocation_id"));
    }

    private static Long nullableLong(ResultSet rs, String column) throws SQLException {
        long value = rs.getLong(column);
        return rs.wasNull() ? null : value;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.isTextual()) {
            throw new FulfillmentSecretException("Fulfillment instructions are invalid");
        }
        return value.asString();
    }

    private static String nullableText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : text(node, field);
    }

    private record UserIdentity(long id, String issuer, String subject) {
    }

    private record FulfillmentLineRow(
            long orderId,
            String orderStatus,
            Long fulfillmentId,
            long orderItemId,
            long productId,
            FulfillmentType fulfillmentType,
            String deliveryType,
            String status,
            String instructionsSnapshot) {
    }

    private record FulfillmentSecretRow(
            long orderId,
            String orderStatus,
            long fulfillmentId,
            long orderItemId,
            long productId,
            FulfillmentType fulfillmentType,
            String fulfillmentStatus,
            long inventoryItemId,
            String provider,
            int payloadSchemaVersion,
            int encryptionKeyVersion,
            byte[] ciphertext,
            byte[] nonce,
            byte[] fingerprint,
            String allocationStatus,
            long allocationId) {
    }
}
