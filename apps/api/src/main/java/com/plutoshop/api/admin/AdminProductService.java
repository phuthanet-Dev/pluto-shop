package com.plutoshop.api.admin;

import java.io.IOException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.dao.DataIntegrityViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.plutoshop.api.catalog.ProductSelectionMode;
import com.plutoshop.api.catalog.ProductDeliveryType;
import com.plutoshop.api.catalog.ProductStatus;
import com.plutoshop.api.error.InvalidRequestParameterException;
import com.plutoshop.api.productimage.ProductImageStorage;

@Service
public class AdminProductService {

    private static final String CURRENCY = "THB";
    private static final Logger LOGGER = LoggerFactory.getLogger(AdminProductService.class);
    private static final RowMapper<AdminProductResponse> PRODUCT_ROW = AdminProductService::mapProduct;

    private final NamedParameterJdbcTemplate jdbc;
    private final ProductImageStorage imageStorage;

    AdminProductService(NamedParameterJdbcTemplate adminJdbcTemplate, ProductImageStorage imageStorage) {
        this.jdbc = adminJdbcTemplate;
        this.imageStorage = imageStorage;
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public AdminProductListResponse list(String query) {
        String pattern = searchPattern(query);
        String sql = """
                SELECT id, slug, name_th, name_en, short_description_th, short_description_en,
                       description_th, description_en,
                       selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                       delivery_type, warranty_days, stock_warning_threshold,
                       status, sort_order, image_key, image_content_type, image_size_bytes,
                       image_width, image_height, image_sha256, updated_at, updated_by, version
                FROM products
                """ + (pattern == null ? "" : "WHERE lower(slug) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(name_th) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(name_en) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(short_description_th) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(short_description_en) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(description_th) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(description_en) LIKE :pattern ESCAPE '\\' ")
                + "ORDER BY sort_order, id";
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (pattern != null) params.addValue("pattern", pattern);
        List<AdminProductResponse> items = jdbc.query(sql, params, PRODUCT_ROW);
        return new AdminProductListResponse(items, items.size());
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse create(AdminProductWriteRequest request, AdminActor actor) {
        validateRequest(request, true);
        AdminProductWriteRequest effectiveRequest = request;
        if (request.selectionMode() == ProductSelectionMode.MULTI_OPTION) {
            GroupRecord group = ensureGroupForProduct(request, actor);
            effectiveRequest = withGroupCard(request, group);
        }
        ensureUnique(null, effectiveRequest);
        try {
            return insert(effectiveRequest, actor);
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug or sort order already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductListResponse createMulti(
            List<AdminProductWriteRequest> requests,
            AdminProductGroupWriteRequest groupRequest,
            AdminActor actor) {
        String optionGroup = validateMultiRequest(requests, 2, null);
        GroupRecord group = prepareNewGroup(optionGroup, groupRequest, requests.get(0), actor);
        try {
            List<AdminProductResponse> products = new ArrayList<>(requests.size());
            for (AdminProductWriteRequest request : requests) {
                AdminProductWriteRequest effectiveRequest = withGroupCard(request, group);
                ensureUnique(null, effectiveRequest);
                products.add(insert(effectiveRequest, actor));
            }
            return new AdminProductListResponse(products, products.size());
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug or sort order already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductListResponse appendMulti(
            String optionGroup,
            List<AdminProductWriteRequest> requests,
            AdminProductGroupWriteRequest groupRequest,
            AdminActor actor) {
        String normalizedGroup = normalizeGroupKey(optionGroup);
        if (requests == null) {
            validateMultiRequest(null, 1, normalizedGroup);
        }
        List<AdminProductWriteRequest> normalizedRequests = requests.stream()
                .map(request -> {
                    String suppliedGroup = trimOptional(request.optionGroup());
                    if (suppliedGroup != null && !normalizedGroup.equals(suppliedGroup)) {
                        throw new InvalidRequestParameterException("Child optionGroup must match the requested multi-option group");
                    }
                    return withOptionGroup(request, normalizedGroup);
                })
                .toList();
        validateMultiRequest(normalizedRequests, 1, normalizedGroup);
        GroupRecord current = requiredGroupForUpdate(normalizedGroup);
        GroupRecord effectiveGroup = groupRequest == null
                ? current
                : updateGroupMetadata(current, groupRequest, actor);
        try {
            List<AdminProductResponse> products = new ArrayList<>(normalizedRequests.size());
            for (AdminProductWriteRequest request : normalizedRequests) {
                AdminProductWriteRequest effectiveRequest = withGroupCard(request, effectiveGroup);
                ensureUnique(null, effectiveRequest);
                products.add(insert(effectiveRequest, actor));
            }
            return new AdminProductListResponse(products, products.size());
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug, sort order, or option label already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public AdminProductGroupResponse getMultiGroup(String optionGroup) {
        String normalizedGroup = normalizeGroupKey(optionGroup);
        GroupRecord group = requiredGroup(normalizedGroup);
        return toGroupResponse(group, findGroupItems(normalizedGroup));
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductGroupResponse updateMultiGroup(
            String optionGroup,
            AdminProductGroupWriteRequest request,
            AdminActor actor) {
        String normalizedGroup = normalizeGroupKey(optionGroup);
        GroupRecord current = requiredGroupForUpdate(normalizedGroup);
        return toGroupResponse(updateGroupMetadata(current, request, actor), findGroupItems(normalizedGroup));
    }

    private AdminProductResponse insert(AdminProductWriteRequest request, AdminActor actor) {
        AdminProductResponse product = jdbc.queryForObject("""
                    INSERT INTO products (
                        slug, name_th, name_en, short_description_th, short_description_en,
                        description_th, description_en, selection_mode,
                        option_group, option_label_th, option_label_en, price_minor, currency,
                        stock_quantity, delivery_type, warranty_days,
                        stock_warning_threshold, instant_delivery, status, sort_order,
                        catalog_order, active, updated_at, updated_by, version
                    ) VALUES (
                        :slug, :nameTh, :nameEn, :shortDescriptionTh, :shortDescriptionEn,
                        :descriptionTh, :descriptionEn, :selectionMode,
                        :optionGroup, :optionLabelTh, :optionLabelEn, :priceMinor, :currency,
                        :stockQuantity, :deliveryType, :warrantyDays,
                        :stockWarningThreshold, :instantDelivery, :status, :sortOrder,
                        :catalogOrder, :active, CURRENT_TIMESTAMP, :updatedBy, 0
                    )
                    RETURNING id, slug, name_th, name_en, short_description_th, short_description_en,
                              description_th, description_en,
                              selection_mode, option_group, option_label_th, option_label_en,
                              price_minor, currency, stock_quantity,
                              delivery_type, warranty_days, stock_warning_threshold,
                              status, sort_order, image_key, image_content_type, image_size_bytes,
                       image_width, image_height, image_sha256, updated_at, updated_by, version
                    """, writeParams(request, actor), PRODUCT_ROW);
        writeAudit(product.id(), "CREATE", actor, fields("created"));
        return product;
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse update(long id, AdminProductWriteRequest request, AdminActor actor) {
        validateRequest(request, false);
        AdminProductResponse current = required(id);
        requireVersion(current, request.version());
        ensureManagedStockMatchesInventory(id, request.stockQuantity());
        AdminProductWriteRequest effectiveRequest = request;
        if (request.selectionMode() == ProductSelectionMode.MULTI_OPTION) {
            GroupRecord group = ensureGroupForProduct(request, actor);
            effectiveRequest = withGroupCard(request, group);
        }
        ensureUnique(id, effectiveRequest);
        List<String> changed = changedFields(current, effectiveRequest);
        try {
            int updated = jdbc.update("""
                    UPDATE products
                    SET slug = :slug,
                        name_th = :nameTh,
                        name_en = :nameEn,
                        short_description_th = :shortDescriptionTh,
                        short_description_en = :shortDescriptionEn,
                        description_th = :descriptionTh,
                        description_en = :descriptionEn,
                        selection_mode = :selectionMode,
                        option_group = :optionGroup,
                        option_label_th = :optionLabelTh,
                        option_label_en = :optionLabelEn,
                        price_minor = :priceMinor,
                        currency = :currency,
                        stock_quantity = CASE
                            WHEN EXISTS (
                                SELECT 1 FROM product_fulfillment_profiles pfp
                                WHERE pfp.product_id = products.id
                                  AND pfp.fulfillment_type IN (
                                      'DISCORD_ACCOUNT', 'LICENSE_KEY', 'INVITE_URL', 'REDEEM_CODE'
                                  )
                            ) THEN (
                                SELECT COUNT(*)::integer
                                FROM digital_inventory_items dii
                                WHERE dii.product_id = products.id
                                  AND dii.status = 'AVAILABLE'
                                  AND (dii.expires_at IS NULL OR dii.expires_at > CURRENT_TIMESTAMP)
                            )
                            ELSE :stockQuantity
                        END,
                        delivery_type = :deliveryType,
                        warranty_days = :warrantyDays,
                        stock_warning_threshold = :stockWarningThreshold,
                        instant_delivery = :instantDelivery,
                        status = :status,
                        sort_order = :sortOrder,
                        catalog_order = :catalogOrder,
                        active = :active,
                        updated_at = CURRENT_TIMESTAMP,
                        updated_by = :updatedBy,
                        version = version + 1
                    WHERE id = :id AND version = :version
                    """, writeParams(effectiveRequest, actor).addValue("id", id));
            if (updated == 0) throw new AdminProductConflictException("Product was changed by another admin");
            AdminProductResponse result = required(id);
            writeAudit(id, "UPDATE", actor, fields(changed.toArray(String[]::new)));
            return result;
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug or sort order already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse updateStock(long id, AdminStockUpdateRequest request, AdminActor actor) {
        AdminProductResponse current = required(id);
        requireVersion(current, request.version());
        if (hasManagedFulfillment(id)) {
            throw new AdminProductConflictException(
                    "Stock for inventory-backed products is managed by fulfillment");
        }
        int updated = jdbc.update("""
                UPDATE products
                SET stock_quantity = :stockQuantity,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id AND version = :version
                """, new MapSqlParameterSource()
                .addValue("stockQuantity", request.stockQuantity())
                .addValue("updatedBy", actor.subject())
                .addValue("id", id)
                .addValue("version", request.version()));
        if (updated == 0) throw new AdminProductConflictException("Product was changed by another admin");
        AdminProductResponse result = required(id);
        writeAudit(id, "STOCK", actor, fields("stockQuantity"));
        return result;
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public void delete(long id, long version, AdminActor actor) {
        String previousImageKey = imageKey(id);
        String result = jdbc.queryForObject("""
                SELECT delete_product_and_carts(
                    :productId, :version, :actorIssuer, :actorSubject
                )
                """, new MapSqlParameterSource()
                .addValue("productId", id)
                .addValue("version", version)
                .addValue("actorIssuer", actor.issuer())
                .addValue("actorSubject", actor.subject()), String.class);
        if ("NOT_FOUND".equals(result)) throw new AdminProductNotFoundException(id);
        if ("VERSION_CONFLICT".equals(result)) {
            throw new AdminProductConflictException("Product was changed by another admin");
        }
        if ("FULFILLMENT_CONFLICT".equals(result)) {
            throw new AdminProductConflictException(
                    "Product has fulfillment data and cannot be deleted");
        }
        if ("INVALID_ARGUMENT".equals(result)) {
            throw new AdminProductConflictException("Product delete request is invalid");
        }
        if (!"DELETED".equals(result)) {
            throw new AdminProductConflictException("Product could not be deleted");
        }
        registerImageCleanup(previousImageKey);
    }

    public AdminProductResponse requireForImage(long id) {
        return required(id);
    }

    private AdminProductResponse required(long id) {
        return findById(id).orElseThrow(() -> new AdminProductNotFoundException(id));
    }

    private String imageKey(long id) {
        List<String> keys = jdbc.query(
                "SELECT image_key FROM products WHERE id = :id",
                new MapSqlParameterSource("id", id),
                (rs, rowNum) -> rs.getString("image_key"));
        return keys.isEmpty() ? null : keys.get(0);
    }

    private void registerImageCleanup(String imageKey) {
        if (imageKey == null) return;
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("Product image transaction synchronization is unavailable");
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                try {
                    imageStorage.delete(imageKey);
                } catch (IOException | RuntimeException exception) {
                    LOGGER.warn("Could not clean deleted product image key {}", imageKey);
                }
            }
        });
    }

    private Optional<AdminProductResponse> findById(long id) {
        List<AdminProductResponse> results = jdbc.query("""
                SELECT id, slug, name_th, name_en, short_description_th, short_description_en,
                       description_th, description_en,
                       selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                       delivery_type, warranty_days, stock_warning_threshold,
                       status, sort_order, image_key, image_content_type, image_size_bytes,
                       image_width, image_height, image_sha256, updated_at, updated_by, version
                FROM products WHERE id = :id
                """, new MapSqlParameterSource("id", id), PRODUCT_ROW);
        return results.stream().findFirst();
    }

    private void ensureManagedStockMatchesInventory(long productId, int requestedStock) {
        if (!hasManagedFulfillment(productId)) {
            return;
        }
        Long available = jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM digital_inventory_items
                WHERE product_id = :productId
                  AND status = 'AVAILABLE'
                  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
                """, Map.of("productId", productId), Long.class);
        if (available == null || available != requestedStock) {
            throw new AdminProductConflictException(
                    "Stock for inventory-backed products is managed by fulfillment");
        }
    }

    private boolean hasManagedFulfillment(long productId) {
        List<String> types = jdbc.query("""
                SELECT fulfillment_type
                FROM product_fulfillment_profiles
                WHERE product_id = :productId
                  AND fulfillment_type IN (
                      'DISCORD_ACCOUNT', 'LICENSE_KEY', 'INVITE_URL', 'REDEEM_CODE'
                  )
                """, Map.of("productId", productId),
                (rs, rowNum) -> rs.getString("fulfillment_type"));
        return !types.isEmpty();
    }

    private void ensureUnique(Long id, AdminProductWriteRequest request) {
        if (duplicate("slug", request.slug(), id)
                || duplicate("catalog_order", request.sortOrder(), id)) {
            throw new AdminProductConflictException("Product slug or sort order already exists");
        }
    }

    private boolean duplicate(String column, Object value, Long id) {
        String sql = id == null
                ? "SELECT count(*) FROM products WHERE " + column + " = :value"
                : "SELECT count(*) FROM products WHERE " + column + " = :value AND id <> :id";
        MapSqlParameterSource params = new MapSqlParameterSource("value", value);
        if (id != null) params.addValue("id", id);
        return jdbc.queryForObject(sql, params, Integer.class) > 0;
    }

    private static MapSqlParameterSource writeParams(AdminProductWriteRequest request, AdminActor actor) {
        return new MapSqlParameterSource()
                .addValue("slug", request.slug().trim())
                .addValue("nameTh", request.nameTh().trim())
                .addValue("nameEn", request.nameEn().trim())
                .addValue("shortDescriptionTh", request.shortDescriptionTh().trim())
                .addValue("shortDescriptionEn", request.shortDescriptionEn().trim())
                .addValue("descriptionTh", request.descriptionTh().trim())
                .addValue("descriptionEn", request.descriptionEn().trim())
                .addValue("selectionMode", request.selectionMode().name())
                .addValue("optionGroup", trimOptional(request.optionGroup()))
                .addValue("optionLabelTh", trimOptional(request.optionLabelTh()))
                .addValue("optionLabelEn", trimOptional(request.optionLabelEn()))
                .addValue("priceMinor", request.priceMinor())
                .addValue("currency", request.currency())
                .addValue("stockQuantity", request.stockQuantity())
                .addValue("deliveryType", request.deliveryType().name())
                .addValue("warrantyDays", request.warrantyDays())
                .addValue("stockWarningThreshold", request.stockWarningThreshold())
                .addValue("instantDelivery", request.deliveryType() == ProductDeliveryType.INSTANT)
                .addValue("status", request.status().name())
                .addValue("sortOrder", request.sortOrder())
                .addValue("catalogOrder", request.sortOrder())
                .addValue("active", request.status() == ProductStatus.ACTIVE)
                .addValue("updatedBy", actor.subject())
                .addValue("version", request.version());
    }

    private static String trimOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private GroupRecord ensureGroupForProduct(AdminProductWriteRequest request, AdminActor actor) {
        String optionGroup = normalizeGroupKey(request.optionGroup());
        Optional<GroupRecord> existing = findGroupForUpdate(optionGroup);
        if (existing.isPresent()) return existing.get();
        jdbc.update("""
                INSERT INTO product_option_groups (
                    option_group, name_th, name_en,
                    short_description_th, short_description_en, updated_by
                ) VALUES (
                    :optionGroup, :nameTh, :nameEn,
                    :shortDescriptionTh, :shortDescriptionEn, :updatedBy
                )
                ON CONFLICT (option_group) DO NOTHING
                """, groupParams(optionGroup, cardFrom(request), actor));
        // ON CONFLICT keeps this transaction usable when another admin won
        // the insert race; the committed row remains the card source of truth.
        return requiredGroupForUpdate(optionGroup);
    }

    private GroupRecord prepareNewGroup(
            String optionGroup,
            AdminProductGroupWriteRequest groupRequest,
            AdminProductWriteRequest fallback,
            AdminActor actor) {
        Optional<GroupRecord> existing = findGroupForUpdate(optionGroup);
        if (existing.isPresent()) {
            GroupRecord current = existing.get();
            if (hasProducts(optionGroup)) {
                throw new AdminProductConflictException(
                        "Multi-option group already exists; use the append endpoint");
            }
            if (groupRequest == null) return current;
            return updateGroupMetadata(current, groupRequest, actor);
        }

        GroupCard card = groupRequest == null ? cardFrom(fallback) : cardFrom(groupRequest);
        if (groupRequest != null && (groupRequest.version() == null || groupRequest.version() != 0)) {
            throw new InvalidRequestParameterException("new multi-option groups must use version 0");
        }
        try {
            jdbc.update("""
                    INSERT INTO product_option_groups (
                        option_group, name_th, name_en,
                        short_description_th, short_description_en, updated_by
                    ) VALUES (
                        :optionGroup, :nameTh, :nameEn,
                        :shortDescriptionTh, :shortDescriptionEn, :updatedBy
                    )
                    """, groupParams(optionGroup, card, actor));
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException(
                    "Multi-option group already exists; use the append endpoint");
        }
        return requiredGroup(optionGroup);
    }

    private GroupRecord updateGroupMetadata(
            GroupRecord current,
            AdminProductGroupWriteRequest request,
            AdminActor actor) {
        if (request == null) {
            throw new InvalidRequestParameterException("group card data is required");
        }
        if (request.version() == null) {
            throw new InvalidRequestParameterException("group version is required");
        }
        if (current.version() != request.version()) {
            throw new AdminProductConflictException("Multi-option group was changed by another admin");
        }
        GroupCard card = cardFrom(request);
        List<Long> productIds = jdbc.query("""
                SELECT id
                FROM products
                WHERE selection_mode = 'MULTI_OPTION' AND option_group = :optionGroup
                ORDER BY sort_order, id
                """, new MapSqlParameterSource("optionGroup", current.optionGroup()),
                (rs, rowNum) -> rs.getLong("id"));
        int updated = jdbc.update("""
                UPDATE product_option_groups
                SET name_th = :nameTh,
                    name_en = :nameEn,
                    short_description_th = :shortDescriptionTh,
                    short_description_en = :shortDescriptionEn,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE option_group = :optionGroup AND version = :version
                """, groupParams(current.optionGroup(), card, actor)
                .addValue("version", request.version()));
        if (updated == 0) {
            throw new AdminProductConflictException("Multi-option group was changed by another admin");
        }

        if (!productIds.isEmpty()) {
            jdbc.update("""
                    UPDATE products
                    SET name_th = :nameTh,
                        name_en = :nameEn,
                        short_description_th = :shortDescriptionTh,
                        short_description_en = :shortDescriptionEn,
                        updated_at = CURRENT_TIMESTAMP,
                        updated_by = :updatedBy,
                        version = version + 1
                    WHERE selection_mode = 'MULTI_OPTION' AND option_group = :optionGroup
                    """, groupParams(current.optionGroup(), card, actor));
            for (Long productId : productIds) {
                writeAudit(productId, "UPDATE", actor, fields("groupCard"));
            }
        }
        return requiredGroup(current.optionGroup());
    }

    private List<AdminProductResponse> findGroupItems(String optionGroup) {
        return jdbc.query("""
                SELECT id, slug, name_th, name_en, short_description_th, short_description_en,
                       description_th, description_en,
                       selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                       delivery_type, warranty_days, stock_warning_threshold,
                       status, sort_order, image_key, image_content_type, image_size_bytes,
                       image_width, image_height, image_sha256, updated_at, updated_by, version
                FROM products
                WHERE selection_mode = 'MULTI_OPTION' AND option_group = :optionGroup
                ORDER BY sort_order, id
                """, new MapSqlParameterSource("optionGroup", optionGroup), PRODUCT_ROW);
    }

    private Optional<GroupRecord> findGroup(String optionGroup) {
        return findGroup(optionGroup, false);
    }

    private Optional<GroupRecord> findGroupForUpdate(String optionGroup) {
        return findGroup(optionGroup, true);
    }

    private Optional<GroupRecord> findGroup(String optionGroup, boolean forUpdate) {
        String sql = """
                SELECT option_group, name_th, name_en,
                       short_description_th, short_description_en,
                       updated_at, updated_by, version
                FROM product_option_groups
                WHERE option_group = :optionGroup
                """ + (forUpdate ? " FOR UPDATE" : "");
        return jdbc.query(sql, new MapSqlParameterSource("optionGroup", optionGroup), (rs, rowNum) -> {
            Timestamp updatedAt = rs.getTimestamp("updated_at");
            return new GroupRecord(
                    rs.getString("option_group"),
                    rs.getString("name_th"),
                    rs.getString("name_en"),
                    rs.getString("short_description_th"),
                    rs.getString("short_description_en"),
                    updatedAt == null ? Instant.EPOCH : updatedAt.toInstant(),
                    rs.getString("updated_by"),
                    rs.getLong("version"));
        }).stream().findFirst();
    }

    private GroupRecord requiredGroup(String optionGroup) {
        return findGroup(optionGroup).orElseThrow(() -> new AdminProductGroupNotFoundException(optionGroup));
    }

    private GroupRecord requiredGroupForUpdate(String optionGroup) {
        return findGroupForUpdate(optionGroup)
                .orElseThrow(() -> new AdminProductGroupNotFoundException(optionGroup));
    }

    private boolean hasProducts(String optionGroup) {
        return jdbc.queryForObject("""
                SELECT count(*)
                FROM products
                WHERE selection_mode = 'MULTI_OPTION' AND option_group = :optionGroup
                """, new MapSqlParameterSource("optionGroup", optionGroup), Integer.class) > 0;
    }

    private static AdminProductGroupResponse toGroupResponse(
            GroupRecord group,
            List<AdminProductResponse> items) {
        return new AdminProductGroupResponse(
                group.optionGroup(),
                group.nameTh(),
                group.nameEn(),
                group.shortDescriptionTh(),
                group.shortDescriptionEn(),
                group.updatedAt(),
                group.updatedBy(),
                group.version(),
                items);
    }

    private static MapSqlParameterSource groupParams(
            String optionGroup,
            GroupCard card,
            AdminActor actor) {
        return new MapSqlParameterSource()
                .addValue("optionGroup", optionGroup)
                .addValue("nameTh", card.nameTh())
                .addValue("nameEn", card.nameEn())
                .addValue("shortDescriptionTh", card.shortDescriptionTh())
                .addValue("shortDescriptionEn", card.shortDescriptionEn())
                .addValue("updatedBy", actor.subject());
    }

    private static GroupCard cardFrom(AdminProductWriteRequest request) {
        return new GroupCard(
                requiredText(request.nameTh(), "nameTh"),
                requiredText(request.nameEn(), "nameEn"),
                requiredText(request.shortDescriptionTh(), "shortDescriptionTh"),
                requiredText(request.shortDescriptionEn(), "shortDescriptionEn"));
    }

    private static GroupCard cardFrom(AdminProductGroupWriteRequest request) {
        return new GroupCard(
                requiredText(request.nameTh(), "nameTh"),
                requiredText(request.nameEn(), "nameEn"),
                requiredText(request.shortDescriptionTh(), "shortDescriptionTh"),
                requiredText(request.shortDescriptionEn(), "shortDescriptionEn"));
    }

    private static AdminProductWriteRequest withGroupCard(
            AdminProductWriteRequest request,
            GroupRecord group) {
        return new AdminProductWriteRequest(
                request.slug(),
                group.nameTh(),
                group.nameEn(),
                group.shortDescriptionTh(),
                group.shortDescriptionEn(),
                request.descriptionTh(),
                request.descriptionEn(),
                request.selectionMode(),
                request.optionGroup(),
                request.optionLabelTh(),
                request.optionLabelEn(),
                request.priceMinor(),
                request.currency(),
                request.stockQuantity(),
                request.deliveryType(),
                request.warrantyDays(),
                request.stockWarningThreshold(),
                request.status(),
                request.sortOrder(),
                request.version());
    }

    private static AdminProductWriteRequest withGroupCard(
            AdminProductWriteRequest request,
            GroupCard card) {
        return new AdminProductWriteRequest(
                request.slug(),
                card.nameTh(),
                card.nameEn(),
                card.shortDescriptionTh(),
                card.shortDescriptionEn(),
                request.descriptionTh(),
                request.descriptionEn(),
                request.selectionMode(),
                request.optionGroup(),
                request.optionLabelTh(),
                request.optionLabelEn(),
                request.priceMinor(),
                request.currency(),
                request.stockQuantity(),
                request.deliveryType(),
                request.warrantyDays(),
                request.stockWarningThreshold(),
                request.status(),
                request.sortOrder(),
                request.version());
    }

    private static AdminProductWriteRequest withOptionGroup(
            AdminProductWriteRequest request,
            String optionGroup) {
        return new AdminProductWriteRequest(
                request.slug(),
                request.nameTh(),
                request.nameEn(),
                request.shortDescriptionTh(),
                request.shortDescriptionEn(),
                request.descriptionTh(),
                request.descriptionEn(),
                request.selectionMode(),
                optionGroup,
                request.optionLabelTh(),
                request.optionLabelEn(),
                request.priceMinor(),
                request.currency(),
                request.stockQuantity(),
                request.deliveryType(),
                request.warrantyDays(),
                request.stockWarningThreshold(),
                request.status(),
                request.sortOrder(),
                request.version());
    }

    private static String normalizeGroupKey(String optionGroup) {
        String normalized = trimOptional(optionGroup);
        if (normalized == null || normalized.length() > 120
                || normalized.equals(".") || normalized.equals("..")
                || normalized.chars().anyMatch(character -> character < 0x20 || character == 0x7f)
                || normalized.indexOf('/') >= 0 || normalized.indexOf('\\') >= 0
                || normalized.indexOf('?') >= 0 || normalized.indexOf('#') >= 0) {
            throw new InvalidRequestParameterException("optionGroup contains an invalid path segment");
        }
        return normalized;
    }

    private static String requiredText(String value, String field) {
        String normalized = trimOptional(value);
        if (normalized == null) {
            throw new InvalidRequestParameterException(field + " is required");
        }
        return normalized;
    }

    private record GroupCard(
            String nameTh,
            String nameEn,
            String shortDescriptionTh,
            String shortDescriptionEn) {
    }

    private record GroupRecord(
            String optionGroup,
            String nameTh,
            String nameEn,
            String shortDescriptionTh,
            String shortDescriptionEn,
            Instant updatedAt,
            String updatedBy,
            long version) {
    }

    private static void validateRequest(AdminProductWriteRequest request, boolean create) {
        if (request == null) {
            throw new InvalidRequestParameterException("product data is required");
        }
        requiredText(request.slug(), "slug");
        requiredText(request.nameTh(), "nameTh");
        requiredText(request.nameEn(), "nameEn");
        requiredText(request.shortDescriptionTh(), "shortDescriptionTh");
        requiredText(request.shortDescriptionEn(), "shortDescriptionEn");
        requiredText(request.descriptionTh(), "descriptionTh");
        requiredText(request.descriptionEn(), "descriptionEn");
        if (request.selectionMode() == null || request.deliveryType() == null || request.status() == null) {
            throw new InvalidRequestParameterException("selectionMode, deliveryType, and status are required");
        }
        if (!CURRENCY.equals(request.currency())) {
            throw new InvalidRequestParameterException("currency must be THB");
        }
        if (create && request.version() != 0) {
            throw new InvalidRequestParameterException("new products must use version 0");
        }
        validateSelection(request);

    }

    private static String validateMultiRequest(
            List<AdminProductWriteRequest> requests,
            int minimum,
            String expectedGroup) {
        if (requests == null || requests.size() < minimum || requests.size() > 100) {
            String range = minimum == 1 ? "between 1 and 100" : "between 2 and 100";
            throw new InvalidRequestParameterException("MULTI_OPTION products require " + range + " children");
        }

        String group = null;
        Set<String> slugs = new HashSet<>();
        Set<String> thaiLabels = new HashSet<>();
        Set<String> englishLabels = new HashSet<>();
        Set<Integer> sortOrders = new HashSet<>();
        for (AdminProductWriteRequest request : requests) {
            validateRequest(request, true);
            if (request.selectionMode() != ProductSelectionMode.MULTI_OPTION) {
                throw new InvalidRequestParameterException("MULTI_OPTION children must use selectionMode MULTI_OPTION");
            }
            String currentGroup = trimOptional(request.optionGroup());
            String currentThaiLabel = trimOptional(request.optionLabelTh());
            String currentEnglishLabel = trimOptional(request.optionLabelEn());
            if (currentGroup == null || currentThaiLabel == null || currentEnglishLabel == null) {
                throw new InvalidRequestParameterException(
                        "MULTI_OPTION children require optionGroup, optionLabelTh, and optionLabelEn");
            }
            if (group == null) {
                group = currentGroup;
            } else if (!group.equals(currentGroup)) {
                throw new InvalidRequestParameterException("MULTI_OPTION children must use the same optionGroup");
            }
            if (expectedGroup != null && !expectedGroup.equals(currentGroup)) {
                throw new InvalidRequestParameterException("MULTI_OPTION children must use the requested optionGroup");
            }
            if (!slugs.add(request.slug().trim())
                    || !thaiLabels.add(currentThaiLabel.toLowerCase(Locale.ROOT))
                    || !englishLabels.add(currentEnglishLabel.toLowerCase(Locale.ROOT))
                    || !sortOrders.add(request.sortOrder())) {
                throw new InvalidRequestParameterException("MULTI_OPTION children must have unique slugs, option labels, and sortOrder");
            }
        }
        return group;
    }

    private static void validateSelection(AdminProductWriteRequest request) {
        boolean hasGroup = request.optionGroup() != null && !request.optionGroup().isBlank();
        boolean hasThaiLabel = request.optionLabelTh() != null && !request.optionLabelTh().isBlank();
        boolean hasEnglishLabel = request.optionLabelEn() != null && !request.optionLabelEn().isBlank();
        if (request.selectionMode() == ProductSelectionMode.SINGLE_OPTION
                && (hasGroup || hasThaiLabel || hasEnglishLabel)) {
            throw new InvalidRequestParameterException("SINGLE_OPTION products must not have option metadata");
        }
        if (request.selectionMode() == ProductSelectionMode.MULTI_OPTION
                && (!hasGroup || !hasThaiLabel || !hasEnglishLabel)) {
            throw new InvalidRequestParameterException(
                    "MULTI_OPTION products require optionGroup, optionLabelTh, and optionLabelEn");
        }
    }


    private static void requireVersion(AdminProductResponse current, long version) {
        if (current.version() != version) {
            throw new AdminProductConflictException("Product was changed by another admin");
        }
    }

    private static List<String> changedFields(AdminProductResponse current, AdminProductWriteRequest request) {
        List<String> changed = new ArrayList<>();
        if (!current.slug().equals(request.slug().trim())) changed.add("slug");
        if (!current.nameTh().equals(request.nameTh().trim())) changed.add("nameTh");
        if (!current.nameEn().equals(request.nameEn().trim())) changed.add("nameEn");
        if (!current.shortDescriptionTh().equals(request.shortDescriptionTh().trim())) changed.add("shortDescriptionTh");
        if (!current.shortDescriptionEn().equals(request.shortDescriptionEn().trim())) changed.add("shortDescriptionEn");
        if (!current.descriptionTh().equals(request.descriptionTh().trim())) changed.add("descriptionTh");
        if (!current.descriptionEn().equals(request.descriptionEn().trim())) changed.add("descriptionEn");
        if (current.selectionMode() != request.selectionMode()) changed.add("selectionMode");
        if (!java.util.Objects.equals(current.optionGroup(), trimOptional(request.optionGroup()))) changed.add("optionGroup");
        if (!java.util.Objects.equals(current.optionLabelTh(), trimOptional(request.optionLabelTh()))) changed.add("optionLabelTh");
        if (!java.util.Objects.equals(current.optionLabelEn(), trimOptional(request.optionLabelEn()))) changed.add("optionLabelEn");
        if (current.priceMinor() != request.priceMinor()) changed.add("priceMinor");
        if (current.stockQuantity() != request.stockQuantity()) changed.add("stockQuantity");

        if (current.deliveryType() != request.deliveryType()) changed.add("deliveryType");
        if (current.warrantyDays() != request.warrantyDays()) changed.add("warrantyDays");
        if (current.stockWarningThreshold() != request.stockWarningThreshold()) changed.add("stockWarningThreshold");
        if (current.status() != request.status()) changed.add("status");
        if (current.sortOrder() != request.sortOrder()) changed.add("sortOrder");
        return changed.isEmpty() ? List.of("updated") : changed;
    }

    private void writeAudit(long productId, String action, AdminActor actor, String changedFields) {
        jdbc.update("""
                INSERT INTO product_audit_log (product_id, action, actor_issuer, actor_subject, changed_fields)
                VALUES (:productId, :action, :actorIssuer, :actorSubject, CAST(:changedFields AS jsonb))
                """, new MapSqlParameterSource()
                .addValue("productId", productId)
                .addValue("action", action)
                .addValue("actorIssuer", actor.issuer())
                .addValue("actorSubject", actor.subject())
                .addValue("changedFields", changedFields));
    }

    private static String fields(String... names) {
        return "{\"fields\":[\"" + String.join("\",\"", names) + "\"]}";
    }

    private static String searchPattern(String query) {
        if (query == null || query.isBlank()) return null;
        String escaped = query.trim().toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static AdminProductResponse mapProduct(ResultSet rs, int rowNum) throws SQLException {
        Timestamp updatedAt = rs.getTimestamp("updated_at");
        return new AdminProductResponse(
                rs.getLong("id"),
                rs.getString("slug"),
                rs.getString("name_th"),
                rs.getString("name_en"),
                rs.getString("short_description_th"),
                rs.getString("short_description_en"),
                rs.getString("description_th"),
                rs.getString("description_en"),
                ProductSelectionMode.valueOf(rs.getString("selection_mode")),
                rs.getString("option_group"),
                rs.getString("option_label_th"),
                rs.getString("option_label_en"),
                rs.getInt("price_minor"),
                rs.getString("currency"),
                rs.getInt("stock_quantity"),
                ProductDeliveryType.valueOf(rs.getString("delivery_type")),
                rs.getInt("warranty_days"),
                rs.getInt("stock_warning_threshold"),
                ProductStatus.valueOf(rs.getString("status")),
                rs.getInt("sort_order"),
                rs.getString("image_key") != null,
                rs.getString("image_content_type"),
                rs.getObject("image_size_bytes", Long.class),
                rs.getObject("image_width", Integer.class),
                rs.getObject("image_height", Integer.class),
                updatedAt == null ? Instant.EPOCH : updatedAt.toInstant(),
                rs.getString("updated_by"),
                rs.getLong("version"));
    }

    public record AdminActor(String issuer, String subject) {
    }
}
