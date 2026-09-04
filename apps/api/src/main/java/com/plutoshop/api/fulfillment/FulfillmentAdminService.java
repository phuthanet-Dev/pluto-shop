package com.plutoshop.api.fulfillment;

import java.net.URI;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.plutoshop.api.admin.AdminProductService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;

@Service
public class FulfillmentAdminService {

    private static final String QUANTITY_POLICY = "ONE_PER_ORDER_LINE";
    private static final int CURRENT_SCHEMA_VERSION = 1;
    private static final int MAX_INVENTORY_LIST = 500;
    private static final int MAX_MANUAL_QUEUE_LIST = 500;
    private static final int MAX_IMPORT_ITEMS = 100;
    private static final int MAX_STEPS = 50;
    private static final Pattern PROVIDER_PATTERN = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$");
    private static final Pattern METADATA_KEY_PATTERN = Pattern.compile("^[A-Za-z][A-Za-z0-9_.-]{0,63}$");
    private static final Set<String> SECRET_METADATA_KEYS = Set.of(
            "email", "password", "license", "licensekey", "license_key",
            "inviteurl", "invite_url", "code", "secret", "token", "ciphertext", "nonce");

    private final NamedParameterJdbcTemplate jdbc;
    private final FulfillmentSecretCodec secretCodec;
    private final ObjectMapper objectMapper;
    private final FulfillmentPayloadFactory payloadFactory;

    FulfillmentAdminService(
            @Qualifier("adminJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            FulfillmentSecretCodec secretCodec,
            ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.secretCodec = secretCodec;
        this.objectMapper = objectMapper;
        this.payloadFactory = new FulfillmentPayloadFactory(new FulfillmentPayloadValidator());
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public FulfillmentProfileResponse getProfile(long productId) {
        ensureProduct(productId);
        ProfileRow profile = findProfile(productId, false);
        if (profile == null) {
            return emptyProfile(productId);
        }
        return toProfileResponse(profile);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentProfileResponse updateProfile(
            long productId,
            FulfillmentProfileWriteRequest request,
            AdminProductService.AdminActor actor) {
        ensureProduct(productId);
        validateProfileRequest(request);
        String provider = normalizeProvider(request.fulfillmentType(), request.provider());
        ProfileRow current = findProfile(productId, true);
        boolean identityChanged = current == null
                || current.fulfillmentType() != request.fulfillmentType()
                || !Objects.equals(current.provider(), provider)
                || current.payloadSchemaVersion() != request.payloadSchemaVersion();

        if (current == null) {
            if (request.version() != 0) {
                throw new FulfillmentConflictException("Fulfillment profile version is stale");
            }
            try {
                jdbc.update("""
                        INSERT INTO product_fulfillment_profiles (
                            product_id, fulfillment_type, provider, payload_schema_version,
                            quantity_policy, version, updated_at, updated_by
                        ) VALUES (
                            :productId, :fulfillmentType, :provider, :schemaVersion,
                            :quantityPolicy, 0, CURRENT_TIMESTAMP, :updatedBy
                        )
                        """, new MapSqlParameterSource()
                        .addValue("productId", productId)
                        .addValue("fulfillmentType", request.fulfillmentType().name())
                        .addValue("provider", provider)
                        .addValue("schemaVersion", request.payloadSchemaVersion())
                        .addValue("quantityPolicy", QUANTITY_POLICY)
                        .addValue("updatedBy", actorSubject(actor)));
            } catch (DataIntegrityViolationException exception) {
                throw new FulfillmentConflictException("Fulfillment profile was changed concurrently");
            }
        } else {
            if (current.version() != request.version()) {
                throw new FulfillmentConflictException("Fulfillment profile version is stale");
            }
            if (current.fulfillmentType() != request.fulfillmentType()
                    && inventoryExists(productId)) {
                throw new FulfillmentConflictException(
                        "Fulfillment type cannot change while inventory exists");
            }
            if (inventoryExists(productId)
                    && (!Objects.equals(current.provider(), provider)
                            || current.payloadSchemaVersion() != request.payloadSchemaVersion())) {
                throw new FulfillmentConflictException(
                        "Fulfillment provider or schema cannot change while inventory exists");
            }
            int updated = jdbc.update("""
                    UPDATE product_fulfillment_profiles
                    SET fulfillment_type = :fulfillmentType,
                        provider = :provider,
                        payload_schema_version = :schemaVersion,
                        quantity_policy = :quantityPolicy,
                        version = version + 1,
                        updated_at = CURRENT_TIMESTAMP,
                        updated_by = :updatedBy
                    WHERE product_id = :productId
                      AND version = :version
                    """, new MapSqlParameterSource()
                    .addValue("productId", productId)
                    .addValue("fulfillmentType", request.fulfillmentType().name())
                    .addValue("provider", provider)
                    .addValue("schemaVersion", request.payloadSchemaVersion())
                    .addValue("quantityPolicy", QUANTITY_POLICY)
                    .addValue("updatedBy", actorSubject(actor))
                    .addValue("version", request.version()));
            if (updated != 1) {
                throw new FulfillmentConflictException("Fulfillment profile was changed concurrently");
            }
        }

        if (request.steps() != null || current == null) {
            replaceSteps(productId, request.steps() == null ? List.of() : request.steps(), actorSubject(actor));
        }
        if (request.fulfillmentType().requiresSecurePayload() && identityChanged) {
            syncProductStock(productId, actorSubject(actor));
        }
        writeAudit(productId, null, "CONFIGURE", actor, Map.of(
                "fulfillmentType", request.fulfillmentType().name(),
                "schemaVersion", request.payloadSchemaVersion()));
        return getProfile(productId);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentInventoryResponse addInventory(
            long productId,
            FulfillmentInventoryWriteRequest request,
            AdminProductService.AdminActor actor) {
        ensureProduct(productId);
        if (request == null || request.fulfillmentType() == null) {
            throw new FulfillmentPayloadValidationException("Fulfillment inventory request is invalid");
        }
        ProfileRow profile = requiredProfile(productId);
        if (!profile.fulfillmentType().requiresSecurePayload()) {
            throw new FulfillmentConflictException("This product does not use secure inventory");
        }
        if (profile.fulfillmentType() != request.fulfillmentType()) {
            throw new FulfillmentConflictException("Inventory type does not match product profile");
        }
        String provider = normalizeProvider(request.fulfillmentType(), request.provider());
        if (!provider.equals(profile.provider())) {
            throw new FulfillmentConflictException("Inventory provider does not match product profile");
        }
        Map<String, String> publicMetadata = validatePublicMetadata(request.publicMetadata());
        FulfillmentPayload payload = payloadFactory.fromFields(
                request.fulfillmentType(), request.payload());
        if (payload.schemaVersion() != profile.payloadSchemaVersion()) {
            throw new FulfillmentConflictException("Inventory schema does not match product profile");
        }
        long inventoryId = nextInventoryId();
        EncodedFulfillmentSecret encoded = secretCodec.encrypt(
                productId, inventoryId, provider, payload);
        if (fingerprintExists(productId, encoded)) {
            throw new FulfillmentConflictException("Duplicate fulfillment inventory");
        }

        try {
            jdbc.update("""
                    INSERT INTO digital_inventory_items (
                        id, product_id, fulfillment_type, provider, payload_schema_version,
                        secret_ciphertext, secret_nonce, encryption_key_version, secret_fingerprint,
                        status, public_metadata_jsonb, created_by, updated_by
                    ) VALUES (
                        :id, :productId, :fulfillmentType, :provider, :schemaVersion,
                        :ciphertext, :nonce, :keyVersion, :fingerprint,
                        'AVAILABLE', CAST(:publicMetadata AS jsonb), :createdBy, :updatedBy
                    )
                    """, new MapSqlParameterSource()
                    .addValue("id", inventoryId)
                    .addValue("productId", productId)
                    .addValue("fulfillmentType", request.fulfillmentType().name())
                    .addValue("provider", provider)
                    .addValue("schemaVersion", payload.schemaVersion())
                    .addValue("ciphertext", encoded.ciphertext())
                    .addValue("nonce", encoded.nonce())
                    .addValue("keyVersion", encoded.encryptionKeyVersion())
                    .addValue("fingerprint", encoded.fingerprint())
                    .addValue("publicMetadata", metadataJson(publicMetadata))
                    .addValue("createdBy", actorSubject(actor))
                    .addValue("updatedBy", actorSubject(actor)));
        } catch (DataIntegrityViolationException exception) {
            throw new FulfillmentConflictException("Duplicate or invalid fulfillment inventory");
        }
        syncProductStock(productId, actorSubject(actor));
        writeAudit(productId, inventoryId, "IMPORT", actor, Map.of("status", "AVAILABLE"));
        return getInventory(productId, inventoryId);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentInventoryListResponse importInventory(
            long productId,
            FulfillmentInventoryImportRequest request,
            AdminProductService.AdminActor actor) {
        ensureProduct(productId);
        if (request == null || request.items().isEmpty() || request.items().size() > MAX_IMPORT_ITEMS) {
            throw new FulfillmentPayloadValidationException("Fulfillment inventory import is invalid");
        }
        for (FulfillmentInventoryWriteRequest item : request.items()) {
            addInventory(productId, item, actor);
        }
        return listInventory(productId);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentInventoryResponse revokeInventory(
            long productId,
            long inventoryId,
            AdminProductService.AdminActor actor,
            String reason) {
        String safeReason = new FulfillmentAdminRevealRequest(reason).requiredReason();
        ensureProduct(productId);
        InventoryRow current = requiredInventory(productId, inventoryId, false);
        if (current.status() == FulfillmentInventoryStatus.REVOKED) {
            return toInventoryResponse(current);
        }
        int updated = jdbc.update("""
                UPDATE digital_inventory_items
                SET status = 'REVOKED',
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id
                  AND product_id = :productId
                  AND status IN ('AVAILABLE', 'QUARANTINED', 'DELIVERED')
                """, new MapSqlParameterSource()
                .addValue("id", inventoryId)
                .addValue("productId", productId)
                .addValue("updatedBy", actorSubject(actor)));
        if (updated != 1) {
            throw new FulfillmentConflictException("Inventory item cannot be revoked in its current state");
        }
        jdbc.update("""
                UPDATE order_fulfillment_allocations
                SET status = 'REVOKED',
                    released_at = COALESCE(released_at, CURRENT_TIMESTAMP),
                    updated_at = CURRENT_TIMESTAMP,
                    version = version + 1
                WHERE inventory_item_id = :inventoryId
                  AND status = 'DELIVERED'
                """, Map.of("inventoryId", inventoryId));
        jdbc.update("""
                UPDATE order_fulfillments
                SET status = 'REVOKED',
                    failure_code = 'REVOKED',
                    updated_at = CURRENT_TIMESTAMP,
                    version = version + 1
                WHERE id IN (
                    SELECT order_fulfillment_id
                    FROM order_fulfillment_allocations
                    WHERE inventory_item_id = :inventoryId
                )
                  AND status = 'DELIVERED'
                """, Map.of("inventoryId", inventoryId));
        syncProductStock(current.productId(), actorSubject(actor));
        writeAudit(current.productId(), inventoryId, "REVOKE", actor, Map.of("reason", safeReason));
        return getInventory(productId, inventoryId);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentInventoryResponse quarantineInventory(
            long productId,
            long inventoryId,
            AdminProductService.AdminActor actor,
            String reason) {
        String safeReason = new FulfillmentAdminRevealRequest(reason).requiredReason();
        ensureProduct(productId);
        InventoryRow current = requiredInventory(productId, inventoryId, false);
        if (current.status() == FulfillmentInventoryStatus.QUARANTINED) {
            return toInventoryResponse(current);
        }
        int updated = jdbc.update("""
                UPDATE digital_inventory_items
                SET status = 'QUARANTINED',
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id AND product_id = :productId AND status = 'AVAILABLE'
                """, new MapSqlParameterSource()
                .addValue("id", inventoryId)
                .addValue("productId", productId)
                .addValue("updatedBy", actorSubject(actor)));
        if (updated != 1) {
            throw new FulfillmentConflictException("Only available inventory can be quarantined");
        }
        syncProductStock(current.productId(), actorSubject(actor));
        writeAudit(current.productId(), inventoryId, "QUARANTINE", actor, Map.of("reason", safeReason));
        return getInventory(productId, inventoryId);
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public List<FulfillmentAdminOrderResponse> listManualFulfillments(OrderFulfillmentStatus status) {
        String statusFilter = status == null
                ? " AND f.status IN ('PENDING', 'RESERVED', 'READY', 'FAILED')"
                : " AND f.status = :status";
        MapSqlParameterSource parameters = new MapSqlParameterSource()
                .addValue("limit", MAX_MANUAL_QUEUE_LIST);
        if (status != null) {
            parameters.addValue("status", status.name());
        }
        return jdbc.query("""
                SELECT f.id,
                       f.order_item_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.delivery_type,
                       f.status
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                JOIN shop_orders o ON o.id = oi.order_id
                WHERE o.status = 'PAID'
                  AND f.delivery_type = 'MANUAL'
                """ + statusFilter + """

                ORDER BY f.updated_at, f.id
                LIMIT :limit
                """, parameters, (rs, rowNum) -> mapAdminOrderResponse(rs));
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentAdminOrderResponse deliverManual(
            long fulfillmentId,
            AdminProductService.AdminActor actor) {
        List<ManualOrderRow> rows = jdbc.query("""
                SELECT f.id,
                       f.order_item_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.delivery_type,
                       f.status,
                       o.status AS order_status
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                JOIN shop_orders o ON o.id = oi.order_id
                WHERE f.id = :fulfillmentId
                FOR UPDATE OF f, o
                """, Map.of("fulfillmentId", fulfillmentId), (rs, rowNum) -> new ManualOrderRow(
                mapAdminOrderResponse(rs),
                rs.getString("order_status")));
        if (rows.isEmpty()) {
            throw new FulfillmentNotFoundException("Order fulfillment not found");
        }
        ManualOrderRow row = rows.get(0);
        FulfillmentAdminOrderResponse current = row.fulfillment();
        if (!"MANUAL".equals(current.deliveryType())) {
            throw new FulfillmentConflictException("Only manual fulfillment can be delivered");
        }
        if (!"PAID".equals(row.orderStatus())) {
            throw new FulfillmentConflictException("Only paid orders can be delivered");
        }
        if (current.status() == OrderFulfillmentStatus.DELIVERED) {
            return current;
        }
        if (current.status() != OrderFulfillmentStatus.READY) {
            throw new FulfillmentConflictException("Order fulfillment is not ready for delivery");
        }

        List<ManualAllocationRow> allocations = jdbc.query("""
                SELECT a.id AS allocation_id,
                       a.status AS allocation_status,
                       d.id AS inventory_item_id,
                       d.status AS inventory_status
                FROM order_fulfillment_allocations a
                JOIN digital_inventory_items d ON d.id = a.inventory_item_id
                WHERE a.order_fulfillment_id = :fulfillmentId
                ORDER BY a.unit_index
                FOR UPDATE OF a, d
                """, Map.of("fulfillmentId", fulfillmentId), (rs, rowNum) -> new ManualAllocationRow(
                rs.getLong("allocation_id"),
                rs.getString("allocation_status"),
                rs.getLong("inventory_item_id"),
                rs.getString("inventory_status")));
        if (current.fulfillmentType().requiresSecurePayload()) {
            deliverSecureManualAllocation(allocations);
        } else if (!allocations.isEmpty()) {
            throw new FulfillmentConflictException("Manual instruction cannot have secure allocation");
        }

        int updated = jdbc.update("""
                UPDATE order_fulfillments
                SET status = 'DELIVERED',
                    failure_code = NULL,
                    next_attempt_at = NULL,
                    last_attempt_at = CURRENT_TIMESTAMP,
                    delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                    delivered_by = :deliveredBy,
                    updated_at = CURRENT_TIMESTAMP,
                    version = version + 1
                WHERE id = :fulfillmentId
                  AND delivery_type = 'MANUAL'
                  AND status = 'READY'
                """, new MapSqlParameterSource()
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("deliveredBy", actorSubject(actor)));
        if (updated != 1) {
            throw new FulfillmentConflictException("Order fulfillment was changed concurrently");
        }
        writeOrderAudit(current.productId(), fulfillmentId, "DELIVER", actor, Map.of(
                "status", OrderFulfillmentStatus.DELIVERED.name(),
                "deliveryType", "MANUAL",
                "fulfillmentType", current.fulfillmentType().name()));
        return new FulfillmentAdminOrderResponse(
                current.fulfillmentId(),
                current.orderItemId(),
                current.productId(),
                current.fulfillmentType(),
                current.deliveryType(),
                OrderFulfillmentStatus.DELIVERED);
    }

    private void deliverSecureManualAllocation(List<ManualAllocationRow> allocations) {
        if (allocations.size() != 1) {
            throw new FulfillmentConflictException("Secure fulfillment allocation is invalid");
        }
        ManualAllocationRow allocation = allocations.get(0);
        if ("DELIVERED".equals(allocation.allocationStatus())
                && "DELIVERED".equals(allocation.inventoryStatus())) {
            return;
        }
        if (!"RESERVED".equals(allocation.allocationStatus())
                || !"RESERVED".equals(allocation.inventoryStatus())) {
            throw new FulfillmentConflictException("Secure fulfillment allocation is not deliverable");
        }
        int inventoryUpdated = jdbc.update("""
                UPDATE digital_inventory_items
                SET status = 'DELIVERED',
                    delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                    reserved_until = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    version = version + 1
                WHERE id = :inventoryItemId AND status = 'RESERVED'
                """, Map.of("inventoryItemId", allocation.inventoryItemId()));
        if (inventoryUpdated != 1) {
            throw new FulfillmentConflictException("Fulfillment inventory changed concurrently");
        }
        int allocationUpdated = jdbc.update("""
                UPDATE order_fulfillment_allocations
                SET status = 'DELIVERED',
                    delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
                    updated_at = CURRENT_TIMESTAMP,
                    version = version + 1
                WHERE id = :allocationId AND status = 'RESERVED'
                """, Map.of("allocationId", allocation.allocationId()));
        if (allocationUpdated != 1) {
            throw new FulfillmentConflictException("Fulfillment allocation changed concurrently");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentAdminOrderResponse markManualReady(
            long fulfillmentId,
            AdminProductService.AdminActor actor) {
        List<FulfillmentAdminOrderResponse> rows = jdbc.query("""
                SELECT order_fulfillments.id,
                       order_fulfillments.order_item_id,
                       order_fulfillments.product_id,
                       order_fulfillments.fulfillment_type,
                       order_fulfillments.delivery_type,
                       order_fulfillments.status
                FROM order_fulfillments
                JOIN shop_order_items oi ON oi.id = order_fulfillments.order_item_id
                JOIN shop_orders o ON o.id = oi.order_id
                WHERE order_fulfillments.id = :fulfillmentId
                  AND o.status = 'PAID'
                FOR UPDATE
                """, Map.of("fulfillmentId", fulfillmentId), (rs, rowNum) ->
                new FulfillmentAdminOrderResponse(
                        rs.getLong("id"),
                        rs.getLong("order_item_id"),
                        rs.getLong("product_id"),
                        FulfillmentType.valueOf(rs.getString("fulfillment_type")),
                        rs.getString("delivery_type"),
                        OrderFulfillmentStatus.valueOf(rs.getString("status"))));
        if (rows.isEmpty()) {
            throw new FulfillmentNotFoundException("Order fulfillment not found");
        }
        FulfillmentAdminOrderResponse current = rows.get(0);
        if (!"MANUAL".equals(current.deliveryType())) {
            throw new FulfillmentConflictException("Only manual fulfillment can be marked ready");
        }
        if (current.status() == OrderFulfillmentStatus.READY) {
            return current;
        }
        if (current.status() != OrderFulfillmentStatus.RESERVED
                && current.status() != OrderFulfillmentStatus.PENDING) {
            throw new FulfillmentConflictException("Order fulfillment cannot be marked ready");
        }
        int updated = jdbc.update("""
                UPDATE order_fulfillments
                SET status = 'READY', updated_at = CURRENT_TIMESTAMP, version = version + 1
                WHERE id = :fulfillmentId AND status IN ('RESERVED', 'PENDING')
                """, Map.of("fulfillmentId", fulfillmentId));
        if (updated != 1) {
            throw new FulfillmentConflictException("Order fulfillment was changed concurrently");
        }
        writeOrderAudit(current.productId(), fulfillmentId, "ASSIGN", actor, Map.of(
                "status", OrderFulfillmentStatus.READY.name(),
                "deliveryType", "MANUAL"));
        return new FulfillmentAdminOrderResponse(
                current.fulfillmentId(),
                current.orderItemId(),
                current.productId(),
                current.fulfillmentType(),
                current.deliveryType(),
                OrderFulfillmentStatus.READY);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentAdminOrderResponse retryFulfillment(
            long fulfillmentId,
            AdminProductService.AdminActor actor) {
        List<FulfillmentAdminOrderResponse> rows = jdbc.query("""
                SELECT f.id,
                       f.order_item_id,
                       f.product_id,
                       f.fulfillment_type,
                       f.delivery_type,
                       f.status
                FROM order_fulfillments f
                JOIN shop_order_items oi ON oi.id = f.order_item_id
                JOIN shop_orders o ON o.id = oi.order_id
                WHERE f.id = :fulfillmentId AND o.status = 'PAID'
                FOR UPDATE OF f
                """, Map.of("fulfillmentId", fulfillmentId), (rs, rowNum) ->
                new FulfillmentAdminOrderResponse(
                        rs.getLong("id"),
                        rs.getLong("order_item_id"),
                        rs.getLong("product_id"),
                        FulfillmentType.valueOf(rs.getString("fulfillment_type")),
                        rs.getString("delivery_type"),
                        OrderFulfillmentStatus.valueOf(rs.getString("status"))));
        if (rows.isEmpty()) {
            throw new FulfillmentNotFoundException("Order fulfillment not found");
        }
        FulfillmentAdminOrderResponse current = rows.get(0);
        if (current.status() != OrderFulfillmentStatus.FAILED) {
            throw new FulfillmentConflictException("Only failed fulfillment can be retried");
        }
        String nextStatus = "MANUAL".equals(current.deliveryType())
                ? OrderFulfillmentStatus.PENDING.name()
                : OrderFulfillmentStatus.READY.name();
        int updated = jdbc.update("""
                UPDATE order_fulfillments
                SET status = :status, failure_code = NULL, retry_count = 0,
                    last_attempt_at = NULL, next_attempt_at = NULL,
                    updated_at = CURRENT_TIMESTAMP, version = version + 1
                WHERE id = :fulfillmentId AND status = 'FAILED'
                """, new MapSqlParameterSource()
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("status", nextStatus));
        if (updated != 1) {
            throw new FulfillmentConflictException("Order fulfillment was changed concurrently");
        }
        writeOrderAudit(current.productId(), fulfillmentId, "ASSIGN", actor, Map.of(
                "transition", "RETRY",
                "status", nextStatus));
        return new FulfillmentAdminOrderResponse(
                current.fulfillmentId(),
                current.orderItemId(),
                current.productId(),
                current.fulfillmentType(),
                current.deliveryType(),
                OrderFulfillmentStatus.valueOf(nextStatus));
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public FulfillmentInventoryListResponse listInventory(long productId) {
        ensureProduct(productId);
        List<InventoryRow> items = jdbc.query("""
                SELECT id, product_id, fulfillment_type, provider, payload_schema_version, status,
                       public_metadata_jsonb, expires_at, reserved_until, created_at, delivered_at
                FROM digital_inventory_items
                WHERE product_id = :productId
                ORDER BY id
                LIMIT :limit
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("limit", MAX_INVENTORY_LIST),
                MASKED_INVENTORY_ROW);
        Integer total = jdbc.queryForObject("""
                SELECT COUNT(*) FROM digital_inventory_items WHERE product_id = :productId
                """, Map.of("productId", productId), Integer.class);
        Integer available = jdbc.queryForObject("""
                SELECT COUNT(*) FROM digital_inventory_items
                WHERE product_id = :productId
                  AND status = 'AVAILABLE'
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                """, Map.of("productId", productId), Integer.class);
        return new FulfillmentInventoryListResponse(
                items.stream().map(this::toInventoryResponse).toList(),
                total == null ? 0 : total,
                available == null ? 0 : available);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public FulfillmentRevealResponse revealInventory(
            long productId,
            long inventoryId,
            AdminProductService.AdminActor actor,
            String reason) {
        String safeReason = new FulfillmentAdminRevealRequest(reason).requiredReason();
        ensureProduct(productId);
        InventoryRow row = requiredInventory(productId, inventoryId, true);
        if (row.status() == FulfillmentInventoryStatus.REVOKED
                || row.status() == FulfillmentInventoryStatus.QUARANTINED) {
            throw new FulfillmentConflictException("Inventory item is not available for reveal");
        }
        FulfillmentPayload payload = secretCodec.decrypt(
                row.productId(), row.id(), row.provider(), row.secret());
        Map<String, String> fields = payloadFactory.toFields(payload);
        writeAudit(row.productId(), row.id(), "REVEAL", actor, Map.of("purpose", safeReason));
        return new FulfillmentRevealResponse(row.id(), row.fulfillmentType(), row.provider(), fields);
    }

    private FulfillmentInventoryResponse getInventory(long productId, long inventoryId) {
        return toInventoryResponse(requiredInventory(productId, inventoryId, false));
    }

    private InventoryRow requiredInventory(long productId, long inventoryId, boolean includeSecret) {
        String sql = includeSecret ? """
                SELECT id, product_id, fulfillment_type, provider, payload_schema_version,
                       secret_ciphertext, secret_nonce, encryption_key_version, secret_fingerprint,
                       status, public_metadata_jsonb, expires_at, reserved_until, created_at, delivered_at
                FROM digital_inventory_items WHERE id = :id AND product_id = :productId
                """ : """
                SELECT id, product_id, fulfillment_type, provider, payload_schema_version,
                       status, public_metadata_jsonb, expires_at, reserved_until, created_at, delivered_at
                FROM digital_inventory_items WHERE id = :id AND product_id = :productId
                """;
        if (includeSecret) {
            sql += " FOR UPDATE";
        }
        List<InventoryRow> rows = jdbc.query(sql, Map.of("id", inventoryId, "productId", productId),
                includeSecret ? INVENTORY_ROW : MASKED_INVENTORY_ROW);
        if (rows.isEmpty()) {
            throw new FulfillmentNotFoundException("Fulfillment inventory item not found");
        }
        return rows.get(0);
    }

    private ProfileRow requiredProfile(long productId) {
        ProfileRow profile = findProfile(productId, false);
        if (profile == null) {
            throw new FulfillmentNotFoundException("Fulfillment profile not found");
        }
        return profile;
    }

    private ProfileRow findProfile(long productId, boolean forUpdate) {
        String sql = """
                SELECT product_id, fulfillment_type, provider, payload_schema_version,
                       quantity_policy, version, updated_at, updated_by
                FROM product_fulfillment_profiles
                WHERE product_id = :productId
                """ + (forUpdate ? " FOR UPDATE" : "");
        List<ProfileRow> rows = jdbc.query(sql, Map.of("productId", productId), PROFILE_ROW);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private FulfillmentProfileResponse toProfileResponse(ProfileRow profile) {
        List<FulfillmentStepResponse> steps = jdbc.query("""
                SELECT id, step_order, audience, title_th, title_en,
                       body_th, body_en, link_url, enabled
                FROM product_fulfillment_steps
                WHERE product_id = :productId
                ORDER BY audience, step_order, id
                """, Map.of("productId", profile.productId()), (rs, rowNum) -> new FulfillmentStepResponse(
                rs.getLong("id"),
                rs.getInt("step_order"),
                FulfillmentAudience.valueOf(rs.getString("audience")),
                rs.getString("title_th"),
                rs.getString("title_en"),
                rs.getString("body_th"),
                rs.getString("body_en"),
                rs.getString("link_url"),
                rs.getBoolean("enabled")));
        Map<String, Object> counts = jdbc.queryForMap("""
                SELECT
                    COUNT(*) FILTER (
                        WHERE status = 'AVAILABLE'
                          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                    ) AS available_count,
                    COUNT(*) FILTER (WHERE status = 'RESERVED') AS reserved_count,
                    COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered_count
                FROM digital_inventory_items
                WHERE product_id = :productId
                """, Map.of("productId", profile.productId()));
        return new FulfillmentProfileResponse(
                profile.productId(),
                profile.fulfillmentType(),
                profile.provider(),
                profile.payloadSchemaVersion(),
                profile.quantityPolicy(),
                profile.version(),
                numberValue(counts.get("available_count")),
                numberValue(counts.get("reserved_count")),
                numberValue(counts.get("delivered_count")),
                steps,
                profile.updatedAt(),
                profile.updatedBy());
    }

    private FulfillmentProfileResponse emptyProfile(long productId) {
        return new FulfillmentProfileResponse(
                productId, FulfillmentType.NONE, null, CURRENT_SCHEMA_VERSION,
                QUANTITY_POLICY, 0, 0, 0, 0, List.of(), Instant.EPOCH, null);
    }

    private void replaceSteps(long productId, List<FulfillmentStepRequest> steps, String updatedBy) {
        validateSteps(steps);
        jdbc.update("DELETE FROM product_fulfillment_steps WHERE product_id = :productId",
                Map.of("productId", productId));
        if (steps == null) {
            return;
        }
        for (FulfillmentStepRequest step : steps) {
            jdbc.update("""
                    INSERT INTO product_fulfillment_steps (
                        product_id, step_order, audience, title_th, title_en,
                        body_th, body_en, link_url, enabled, updated_by
                    ) VALUES (
                        :productId, :stepOrder, :audience, :titleTh, :titleEn,
                        :bodyTh, :bodyEn, :linkUrl, :enabled, :updatedBy
                    )
                    """, new MapSqlParameterSource()
                    .addValue("productId", productId)
                    .addValue("stepOrder", step.stepOrder())
                    .addValue("audience", step.audience().name())
                    .addValue("titleTh", step.titleTh())
                    .addValue("titleEn", step.titleEn())
                    .addValue("bodyTh", step.bodyTh())
                    .addValue("bodyEn", step.bodyEn())
                    .addValue("linkUrl", step.linkUrl())
                    .addValue("enabled", step.enabled())
                    .addValue("updatedBy", updatedBy));
        }
    }

    private void validateProfileRequest(FulfillmentProfileWriteRequest request) {
        if (request == null || request.fulfillmentType() == null
                || request.payloadSchemaVersion() != CURRENT_SCHEMA_VERSION
                || request.version() < 0) {
            throw new FulfillmentPayloadValidationException("Fulfillment profile request is invalid");
        }
        validateSteps(request.steps());
    }

    private void validateSteps(List<FulfillmentStepRequest> steps) {
        if (steps == null) {
            return;
        }
        if (steps.size() > MAX_STEPS) {
            throw new FulfillmentPayloadValidationException("Too many fulfillment steps");
        }
        Set<String> uniqueOrders = new HashSet<>();
        for (FulfillmentStepRequest step : steps) {
            if (step == null || step.stepOrder() < 1 || step.audience() == null
                    || blank(step.titleTh()) || blank(step.titleEn())
                    || blank(step.bodyTh()) || blank(step.bodyEn())
                    || step.titleTh().length() > 180 || step.titleEn().length() > 180
                    || step.bodyTh().length() > 4000 || step.bodyEn().length() > 4000) {
                throw new FulfillmentPayloadValidationException("Fulfillment step is invalid");
            }
            String orderKey = step.audience().name() + ':' + step.stepOrder();
            if (!uniqueOrders.add(orderKey) || hasControl(step.titleTh()) || hasControl(step.titleEn())
                    || hasControl(step.bodyTh()) || hasControl(step.bodyEn())) {
                throw new FulfillmentPayloadValidationException("Fulfillment step is invalid");
            }
            if (step.linkUrl() != null) {
                validateHttpsUrl(step.linkUrl(), "Fulfillment step link is invalid");
            }
        }
    }

    private String normalizeProvider(FulfillmentType type, String provider) {
        if (type == null) {
            throw new FulfillmentPayloadValidationException("Fulfillment type is required");
        }
        if (provider == null || provider.isBlank()) {
            if (type.requiresSecurePayload()) {
                throw new FulfillmentPayloadValidationException("Fulfillment provider is required");
            }
            return null;
        }
        if (!PROVIDER_PATTERN.matcher(provider).matches()) {
            throw new FulfillmentPayloadValidationException("Fulfillment provider is invalid");
        }
        return provider.toUpperCase(Locale.ROOT);
    }

    private Map<String, String> validatePublicMetadata(Map<String, String> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return Map.of();
        }
        if (metadata.size() > 20) {
            throw new FulfillmentPayloadValidationException("Too much fulfillment metadata");
        }
        Map<String, String> safe = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : metadata.entrySet()) {
            String key = entry.getKey();
            String value = entry.getValue();
            if (key == null || value == null || !METADATA_KEY_PATTERN.matcher(key).matches()
                    || SECRET_METADATA_KEYS.contains(key.toLowerCase(Locale.ROOT))
                    || value.length() > 200 || hasControl(value)) {
                throw new FulfillmentPayloadValidationException("Fulfillment metadata is invalid");
            }
            safe.put(key, value);
        }
        return Map.copyOf(safe);
    }

    private void syncProductStock(long productId, String updatedBy) {
        jdbc.update("""
                UPDATE products
                SET stock_quantity = (
                        SELECT COUNT(*) FROM digital_inventory_items
                        WHERE product_id = :productId
                          AND status = 'AVAILABLE'
                          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                    ),
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :productId
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("updatedBy", updatedBy));
    }

    private boolean fingerprintExists(long productId, EncodedFulfillmentSecret encoded) {
        Boolean exists = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM digital_inventory_items
                    WHERE product_id = :productId
                      AND fulfillment_type = :fulfillmentType
                      AND provider = :provider
                      AND secret_fingerprint = :fingerprint
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("fulfillmentType", encoded.type().name())
                .addValue("provider", encoded.provider())
                .addValue("fingerprint", encoded.fingerprint()), Boolean.class);
        return Boolean.TRUE.equals(exists);
    }

    private long nextInventoryId() {
        Long value = jdbc.queryForObject(
                "SELECT nextval(pg_get_serial_sequence('digital_inventory_items', 'id'))",
                Map.of(), Long.class);
        if (value == null || value < 1) {
            throw new FulfillmentSecretException("Fulfillment inventory identifier is unavailable");
        }
        return value;
    }

    private boolean inventoryExists(long productId) {
        Boolean exists = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM digital_inventory_items WHERE product_id = :productId
                )
                """, Map.of("productId", productId), Boolean.class);
        return Boolean.TRUE.equals(exists);
    }

    private void ensureProduct(long productId) {
        if (productId < 1) {
            throw new FulfillmentNotFoundException("Product not found");
        }
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM products WHERE id = :productId",
                Map.of("productId", productId), Integer.class);
        if (count == null || count != 1) {
            throw new FulfillmentNotFoundException("Product not found");
        }
    }

    private void writeAudit(
            long productId,
            Long inventoryId,
            String action,
            AdminProductService.AdminActor actor,
            Map<String, ?> metadata) {
        jdbc.update("""
                INSERT INTO fulfillment_audit_log (
                    product_id, inventory_item_id, action, actor_issuer, actor_subject, metadata_jsonb
                ) VALUES (
                    :productId, :inventoryId, :action, :actorIssuer, :actorSubject,
                    CAST(:metadata AS jsonb)
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("inventoryId", inventoryId)
                .addValue("action", action)
                .addValue("actorIssuer", actor == null ? null : actor.issuer())
                .addValue("actorSubject", actorSubject(actor))
                .addValue("metadata", metadataJson(metadata)));
    }

    private void writeOrderAudit(
            long productId,
            long fulfillmentId,
            String action,
            AdminProductService.AdminActor actor,
            Map<String, ?> metadata) {
        jdbc.update("""
                INSERT INTO fulfillment_audit_log (
                    product_id, order_fulfillment_id, action,
                    actor_issuer, actor_subject, metadata_jsonb
                ) VALUES (
                    :productId, :fulfillmentId, :action,
                    :actorIssuer, :actorSubject, CAST(:metadata AS jsonb)
                )
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("fulfillmentId", fulfillmentId)
                .addValue("action", action)
                .addValue("actorIssuer", actor == null ? null : actor.issuer())
                .addValue("actorSubject", actorSubject(actor))
                .addValue("metadata", metadataJson(metadata)));
    }

    private String metadataJson(Map<String, ?> metadata) {
        ObjectNode node = objectMapper.createObjectNode();
        if (metadata != null) {
            for (Map.Entry<String, ?> entry : metadata.entrySet()) {
                Object value = entry.getValue();
                if (value instanceof Number number) {
                    node.put(entry.getKey(), number.longValue());
                } else if (value instanceof Boolean bool) {
                    node.put(entry.getKey(), bool);
                } else {
                    node.put(entry.getKey(), value == null ? "" : value.toString());
                }
            }
        }
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception exception) {
            throw new FulfillmentSecretException("Fulfillment metadata could not be serialized", exception);
        }
    }

    private Map<String, String> parseMetadata(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            JsonNode node = objectMapper.readTree(json);
            if (node == null || !node.isObject()) {
                throw new FulfillmentSecretException("Fulfillment metadata is invalid");
            }
            Map<String, String> values = new LinkedHashMap<>();
            for (Map.Entry<String, JsonNode> entry : node.properties()) {
                if (!entry.getValue().isTextual()) {
                    throw new FulfillmentSecretException("Fulfillment metadata is invalid");
                }
                values.put(entry.getKey(), entry.getValue().asString());
            }
            return Map.copyOf(values);
        } catch (FulfillmentSecretException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new FulfillmentSecretException("Fulfillment metadata is invalid", exception);
        }
    }

    private FulfillmentInventoryResponse toInventoryResponse(InventoryRow row) {
        return new FulfillmentInventoryResponse(
                row.id(), row.fulfillmentType(), row.provider(), row.payloadSchemaVersion(), row.status(),
                parseMetadata(row.publicMetadataJson()), row.expiresAt(), row.reservedUntil(),
                row.createdAt(), row.deliveredAt());
    }

    private static FulfillmentAdminOrderResponse mapAdminOrderResponse(ResultSet rs) throws SQLException {
        return new FulfillmentAdminOrderResponse(
                rs.getLong("id"),
                rs.getLong("order_item_id"),
                rs.getLong("product_id"),
                FulfillmentType.valueOf(rs.getString("fulfillment_type")),
                rs.getString("delivery_type"),
                OrderFulfillmentStatus.valueOf(rs.getString("status")));
    }

    private static final RowMapper<ProfileRow> PROFILE_ROW = (rs, rowNum) -> new ProfileRow(
            rs.getLong("product_id"),
            FulfillmentType.valueOf(rs.getString("fulfillment_type")),
            rs.getString("provider"),
            rs.getInt("payload_schema_version"),
            rs.getString("quantity_policy"),
            rs.getLong("version"),
            instant(rs.getTimestamp("updated_at")),
            rs.getString("updated_by"));

    private static final RowMapper<InventoryRow> INVENTORY_ROW = (rs, rowNum) -> new InventoryRow(
            rs.getLong("id"),
            rs.getLong("product_id"),
            FulfillmentType.valueOf(rs.getString("fulfillment_type")),
            rs.getString("provider"),
            rs.getInt("payload_schema_version"),
            FulfillmentInventoryStatus.valueOf(rs.getString("status")),
            rs.getString("public_metadata_jsonb"),
            instantOrNull(rs.getTimestamp("expires_at")),
            instantOrNull(rs.getTimestamp("reserved_until")),
            instant(rs.getTimestamp("created_at")),
            instantOrNull(rs.getTimestamp("delivered_at")),
            new EncodedFulfillmentSecret(
                    FulfillmentType.valueOf(rs.getString("fulfillment_type")),
                    rs.getString("provider"),
                    rs.getInt("payload_schema_version"),
                    rs.getInt("encryption_key_version"),
                    rs.getBytes("secret_ciphertext"),
                    rs.getBytes("secret_nonce"),
                    rs.getBytes("secret_fingerprint")));

    private static final RowMapper<InventoryRow> MASKED_INVENTORY_ROW = (rs, rowNum) -> new InventoryRow(
            rs.getLong("id"),
            rs.getLong("product_id"),
            FulfillmentType.valueOf(rs.getString("fulfillment_type")),
            rs.getString("provider"),
            rs.getInt("payload_schema_version"),
            FulfillmentInventoryStatus.valueOf(rs.getString("status")),
            rs.getString("public_metadata_jsonb"),
            instantOrNull(rs.getTimestamp("expires_at")),
            instantOrNull(rs.getTimestamp("reserved_until")),
            instant(rs.getTimestamp("created_at")),
            instantOrNull(rs.getTimestamp("delivered_at")),
            null);

    private static Instant instant(Timestamp timestamp) {
        return timestamp == null ? Instant.EPOCH : timestamp.toInstant();
    }

    private static Instant instantOrNull(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    private static int numberValue(Object value) {
        return value instanceof Number number ? number.intValue() : 0;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private static boolean hasControl(String value) {
        if (value == null) {
            return true;
        }
        for (int index = 0; index < value.length(); index++) {
            if (Character.isISOControl(value.charAt(index))) {
                return true;
            }
        }
        return false;
    }

    private static void validateHttpsUrl(String value, String message) {
        if (value == null || value.length() > 2048 || hasControl(value)) {
            throw new FulfillmentPayloadValidationException(message);
        }
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getHost().isBlank() || uri.getUserInfo() != null
                    || uri.getQuery() != null || uri.getFragment() != null) {
                throw new FulfillmentPayloadValidationException(message);
            }
        } catch (java.net.URISyntaxException exception) {
            throw new FulfillmentPayloadValidationException(message);
        }
    }

    private static String actorSubject(AdminProductService.AdminActor actor) {
        if (actor == null || actor.subject() == null || actor.subject().isBlank()) {
            return "SYSTEM";
        }
        return actor.subject();
    }

    private record ProfileRow(
            long productId,
            FulfillmentType fulfillmentType,
            String provider,
            int payloadSchemaVersion,
            String quantityPolicy,
            long version,
            Instant updatedAt,
            String updatedBy) {
    }

    private record InventoryRow(
            long id,
            long productId,
            FulfillmentType fulfillmentType,
            String provider,
            int payloadSchemaVersion,
            FulfillmentInventoryStatus status,
            String publicMetadataJson,
            Instant expiresAt,
            Instant reservedUntil,
            Instant createdAt,
            Instant deliveredAt,
            EncodedFulfillmentSecret secret) {
    }

    private record ManualOrderRow(
            FulfillmentAdminOrderResponse fulfillment,
            String orderStatus) {
    }

    private record ManualAllocationRow(
            long allocationId,
            String allocationStatus,
            long inventoryItemId,
            String inventoryStatus) {
    }
}
