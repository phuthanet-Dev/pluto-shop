package com.plutoshop.api.fulfillment;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.ObjectMapper;

/**
 * Claims instant-delivery rows after payment and advances their durable state.
 * The decrypted payload is deliberately not returned or logged.
 */
@Service
public class FulfillmentDeliveryService {

    private static final int MAX_BATCH_SIZE = 100;
    private static final long MAX_BACKOFF_SECONDS = 3_600;

    private final NamedParameterJdbcTemplate jdbc;
    private final FulfillmentSecretCodec secretCodec;
    private final ObjectMapper objectMapper;
    private final int maxAttempts;
    private final long backoffBaseSeconds;

    @org.springframework.beans.factory.annotation.Autowired
    public FulfillmentDeliveryService(
            @Qualifier("userJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            FulfillmentSecretCodec secretCodec,
            ObjectMapper objectMapper,
            @Value("${fulfillment.delivery.max-attempts:5}") int maxAttempts,
            @Value("${fulfillment.delivery.backoff-base-seconds:30}") long backoffBaseSeconds) {
        if (maxAttempts < 1 || maxAttempts > 100) {
            throw new IllegalArgumentException("Fulfillment delivery max attempts are invalid");
        }
        if (backoffBaseSeconds < 1 || backoffBaseSeconds > MAX_BACKOFF_SECONDS) {
            throw new IllegalArgumentException("Fulfillment delivery backoff is invalid");
        }
        this.jdbc = jdbc;
        this.secretCodec = secretCodec;
        this.objectMapper = objectMapper;
        this.maxAttempts = maxAttempts;
        this.backoffBaseSeconds = backoffBaseSeconds;
    }

    public FulfillmentDeliveryService(
            NamedParameterJdbcTemplate jdbc,
            FulfillmentSecretCodec secretCodec,
            ObjectMapper objectMapper) {
        this(jdbc, secretCodec, objectMapper, 5, 30);
    }

    @Transactional
    public int processDue(int requestedBatchSize) {
        int batchSize = Math.max(1, Math.min(requestedBatchSize, MAX_BATCH_SIZE));
        List<DeliveryRow> rows = jdbc.query("""
                SELECT f.id AS fulfillment_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.status AS fulfillment_status,
                       f.retry_count,
                       a.id AS allocation_id,
                       a.status AS allocation_status,
                       d.id AS inventory_item_id,
                       d.status AS inventory_status,
                       d.provider,
                       d.payload_schema_version,
                       d.encryption_key_version,
                       d.secret_ciphertext,
                       d.secret_nonce,
                       d.secret_fingerprint
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                JOIN shop_orders o ON o.id = oi.order_id
                JOIN order_fulfillment_allocations a ON a.order_fulfillment_id = f.id
                JOIN digital_inventory_items d ON d.id = a.inventory_item_id
                WHERE o.status = 'PAID'
                  AND f.delivery_type = 'INSTANT'
                  AND (
                      f.status IN ('RESERVED', 'READY')
                      OR (f.status = 'FAILED' AND f.next_attempt_at IS NOT NULL
                          AND f.next_attempt_at <= CURRENT_TIMESTAMP)
                  )
                  AND a.status IN ('RESERVED', 'DELIVERED')
                  AND d.status IN ('RESERVED', 'DELIVERED')
                ORDER BY f.id, a.unit_index
                LIMIT :limit
                FOR UPDATE OF f, a, d SKIP LOCKED
                """, Map.of("limit", batchSize), this::mapDeliveryRow);

        int attempted = 0;
        for (DeliveryRow row : rows) {
            attempted++;
            try {
                deliver(row);
            } catch (FulfillmentSecretConfigurationException exception) {
                markFailed(row, "CONFIGURATION_ERROR");
            } catch (FulfillmentSecretException exception) {
                markFailed(row, "DECRYPTION_FAILED");
            } catch (FulfillmentConflictException exception) {
                markFailed(row, "STATE_CONFLICT");
            }
        }
        return attempted;
    }

    private void deliver(DeliveryRow row) {
        FulfillmentType fulfillmentType = FulfillmentType.valueOf(row.fulfillmentType());
        if (!fulfillmentType.requiresSecurePayload()) {
            throw new FulfillmentConflictException("Only secure fulfillment can be delivered by worker");
        }
        EncodedFulfillmentSecret encoded = new EncodedFulfillmentSecret(
                fulfillmentType,
                row.provider(),
                row.payloadSchemaVersion(),
                row.encryptionKeyVersion(),
                row.ciphertext(),
                row.nonce(),
                row.fingerprint());
        // Decrypt only inside this boundary. The payload is intentionally discarded.
        secretCodec.decrypt(row.productId(), row.inventoryItemId(), row.provider(), encoded);
        markDelivered(row);
    }

    private void markDelivered(DeliveryRow row) {
        if ("RESERVED".equals(row.inventoryStatus())) {
            int updated = jdbc.update("""
                    UPDATE digital_inventory_items
                    SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP,
                        reserved_until = NULL, updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :inventoryItemId AND status = 'RESERVED'
                    """, Map.of("inventoryItemId", row.inventoryItemId()));
            if (updated != 1) {
                throw new FulfillmentConflictException("Fulfillment inventory changed concurrently");
            }
        } else if (!"DELIVERED".equals(row.inventoryStatus())) {
            throw new FulfillmentConflictException("Fulfillment inventory is not deliverable");
        }

        if ("RESERVED".equals(row.allocationStatus())) {
            int updated = jdbc.update("""
                    UPDATE order_fulfillment_allocations
                    SET status = 'DELIVERED', delivered_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP, version = version + 1
                    WHERE id = :allocationId AND status = 'RESERVED'
                    """, Map.of("allocationId", row.allocationId()));
            if (updated != 1) {
                throw new FulfillmentConflictException("Fulfillment allocation changed concurrently");
            }
        } else if (!"DELIVERED".equals(row.allocationStatus())) {
            throw new FulfillmentConflictException("Fulfillment allocation is not deliverable");
        }

        int updated = jdbc.update("""
                UPDATE order_fulfillments
                SET status = 'DELIVERED', failure_code = NULL, next_attempt_at = NULL,
                    last_attempt_at = CURRENT_TIMESTAMP, delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                    delivered_by = 'FULFILLMENT_WORKER', updated_at = CURRENT_TIMESTAMP, version = version + 1
                WHERE id = :fulfillmentId AND status IN ('RESERVED', 'READY', 'FAILED')
                """, Map.of("fulfillmentId", row.fulfillmentId()));
        if (updated != 1) {
            throw new FulfillmentConflictException("Order fulfillment changed concurrently");
        }
        writeAudit(row.productId(), row.fulfillmentId(), row.inventoryItemId(), "DELIVER",
                Map.of("status", OrderFulfillmentStatus.DELIVERED.name()));
    }

    private void markFailed(DeliveryRow row, String failureCode) {
        int nextRetryCount = row.retryCount() + 1;
        Instant nextAttemptAt = nextRetryCount >= maxAttempts ? null : nextAttemptAt(nextRetryCount);
        String nextAttemptSql = nextAttemptAt == null ? "NULL" : ":nextAttemptAt";
        String sql = """
                UPDATE order_fulfillments
                SET status = 'FAILED', failure_code = :failureCode,
                    retry_count = retry_count + 1, last_attempt_at = CURRENT_TIMESTAMP,
                    next_attempt_at = %s, updated_at = CURRENT_TIMESTAMP, version = version + 1
                WHERE id = :fulfillmentId AND status IN ('RESERVED', 'READY', 'FAILED')
                """.formatted(nextAttemptSql);
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("failureCode", failureCode)
                .addValue("fulfillmentId", row.fulfillmentId());
        if (nextAttemptAt != null) {
            parameters.addValue("nextAttemptAt", Timestamp.from(nextAttemptAt));
        }
        int updated = jdbc.update(sql, parameters);
        if (updated == 1) {
            writeAudit(row.productId(), row.fulfillmentId(), row.inventoryItemId(), "FAIL", Map.of(
                    "failureCode", failureCode,
                    "retryCount", nextRetryCount));
        }
    }

    private Instant nextAttemptAt(int retryCount) {
        int exponent = Math.min(retryCount - 1, 10);
        long multiplier = 1L << exponent;
        long delay = Math.min(MAX_BACKOFF_SECONDS, backoffBaseSeconds * multiplier);
        return Instant.now().plusSeconds(delay);
    }

    private void writeAudit(
            long productId,
            long fulfillmentId,
            long inventoryItemId,
            String action,
            Map<String, Object> metadata) {
        jdbc.update("""
                INSERT INTO fulfillment_audit_log (
                    product_id, order_fulfillment_id, inventory_item_id, action, metadata_jsonb
                ) VALUES (
                    :productId, :fulfillmentId, :inventoryItemId, :action, CAST(:metadata AS jsonb)
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("inventoryItemId", inventoryItemId)
                .addValue("action", action)
                .addValue("metadata", objectMapper.writeValueAsString(metadata)));
    }

    private DeliveryRow mapDeliveryRow(ResultSet rs, int rowNumber) throws SQLException {
        return new DeliveryRow(
                rs.getLong("fulfillment_id"),
                rs.getLong("product_id"),
                rs.getString("fulfillment_type"),
                rs.getString("fulfillment_status"),
                rs.getInt("retry_count"),
                rs.getLong("allocation_id"),
                rs.getString("allocation_status"),
                rs.getLong("inventory_item_id"),
                rs.getString("inventory_status"),
                rs.getString("provider"),
                rs.getInt("payload_schema_version"),
                rs.getInt("encryption_key_version"),
                rs.getBytes("secret_ciphertext"),
                rs.getBytes("secret_nonce"),
                rs.getBytes("secret_fingerprint"));
    }

    private record DeliveryRow(
            long fulfillmentId,
            long productId,
            String fulfillmentType,
            String fulfillmentStatus,
            int retryCount,
            long allocationId,
            String allocationStatus,
            long inventoryItemId,
            String inventoryStatus,
            String provider,
            int payloadSchemaVersion,
            int encryptionKeyVersion,
            byte[] ciphertext,
            byte[] nonce,
            byte[] fingerprint) {
    }
}
