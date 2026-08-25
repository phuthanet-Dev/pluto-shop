package com.plutoshop.api.admin;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.plutoshop.api.catalog.ProductType;
import com.plutoshop.api.catalog.ProductSelectionMode;
import com.plutoshop.api.error.InvalidRequestParameterException;

@Service
public class AdminProductService {

    private static final String CURRENCY = "THB";
    private static final RowMapper<AdminProductResponse> PRODUCT_ROW = AdminProductService::mapProduct;

    private final NamedParameterJdbcTemplate jdbc;

    AdminProductService(NamedParameterJdbcTemplate adminJdbcTemplate) {
        this.jdbc = adminJdbcTemplate;
    }

    @Transactional(transactionManager = "adminTransactionManager", readOnly = true)
    public AdminProductListResponse list(String query) {
        String pattern = searchPattern(query);
        String sql = """
                SELECT id, slug, name_th, name_en, description_th, description_en,
                       visual_code, type, selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                       bundle_item_count, instant_delivery, catalog_order, active,
                       updated_at, updated_by, version
                FROM products
                """ + (pattern == null ? "" : "WHERE lower(slug) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(name_th) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(name_en) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(description_th) LIKE :pattern ESCAPE '\\' "
                        + "OR lower(description_en) LIKE :pattern ESCAPE '\\' ")
                + "ORDER BY catalog_order, id";
        MapSqlParameterSource params = new MapSqlParameterSource();
        if (pattern != null) params.addValue("pattern", pattern);
        List<AdminProductResponse> items = jdbc.query(sql, params, PRODUCT_ROW);
        return new AdminProductListResponse(items, items.size());
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse create(AdminProductWriteRequest request, AdminActor actor) {
        validateRequest(request, true);
        ensureUnique(null, request);
        try {
            AdminProductResponse product = jdbc.queryForObject("""
                    INSERT INTO products (
                        slug, name_th, name_en, description_th, description_en,
                        visual_code, type, selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                        bundle_item_count, instant_delivery, catalog_order,
                        active, updated_at, updated_by, version
                    ) VALUES (
                        :slug, :nameTh, :nameEn, :descriptionTh, :descriptionEn,
                        :visualCode, :type, :selectionMode, :optionGroup, :optionLabelTh, :optionLabelEn,
                        :priceMinor, :currency, :stockQuantity,
                        :bundleItemCount, :instantDelivery, :catalogOrder,
                        :active, CURRENT_TIMESTAMP, :updatedBy, 0
                    )
                    RETURNING id, slug, name_th, name_en, description_th, description_en,
                              visual_code, type, selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                              bundle_item_count, instant_delivery, catalog_order, active,
                              updated_at, updated_by, version
                    """, writeParams(request, actor), PRODUCT_ROW);
            writeAudit(product.id(), "CREATE", actor, fields("created"));
            return product;
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug, visual code, or catalog order already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse update(long id, AdminProductWriteRequest request, AdminActor actor) {
        validateRequest(request, false);
        AdminProductResponse current = required(id);
        requireVersion(current, request.version());
        ensureUnique(id, request);
        List<String> changed = changedFields(current, request);
        try {
            int updated = jdbc.update("""
                    UPDATE products
                    SET slug = :slug,
                        name_th = :nameTh,
                        name_en = :nameEn,
                        description_th = :descriptionTh,
                        description_en = :descriptionEn,
                        visual_code = :visualCode,
                        type = :type,
                        selection_mode = :selectionMode,
                        option_group = :optionGroup,
                        option_label_th = :optionLabelTh,
                        option_label_en = :optionLabelEn,
                        price_minor = :priceMinor,
                        currency = :currency,
                        stock_quantity = :stockQuantity,
                        bundle_item_count = :bundleItemCount,
                        instant_delivery = :instantDelivery,
                        catalog_order = :catalogOrder,
                        active = :active,
                        updated_at = CURRENT_TIMESTAMP,
                        updated_by = :updatedBy,
                        version = version + 1
                    WHERE id = :id AND version = :version
                    """, writeParams(request, actor).addValue("id", id));
            if (updated == 0) throw new AdminProductConflictException("Product was changed by another admin");
            AdminProductResponse result = required(id);
            writeAudit(id, "UPDATE", actor, fields(changed.toArray(String[]::new)));
            return result;
        } catch (DataIntegrityViolationException exception) {
            throw new AdminProductConflictException("Product slug, visual code, or catalog order already exists");
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse updateStock(long id, AdminStockUpdateRequest request, AdminActor actor) {
        AdminProductResponse current = required(id);
        requireVersion(current, request.version());
        validateStock(current.type(), request.bundleItemCount());
        int updated = jdbc.update("""
                UPDATE products
                SET stock_quantity = :stockQuantity,
                    bundle_item_count = :bundleItemCount,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id AND version = :version
                """, new MapSqlParameterSource()
                .addValue("stockQuantity", request.stockQuantity())
                .addValue("bundleItemCount", request.bundleItemCount())
                .addValue("updatedBy", actor.subject())
                .addValue("id", id)
                .addValue("version", request.version()));
        if (updated == 0) throw new AdminProductConflictException("Product was changed by another admin");
        AdminProductResponse result = required(id);
        writeAudit(id, "STOCK", actor, fields("stockQuantity", "bundleItemCount"));
        return result;
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse archive(long id, long version, AdminActor actor) {
        AdminProductResponse current = required(id);
        requireVersion(current, version);
        if (!current.active()) return current;
        int updated = jdbc.update("""
                UPDATE products
                SET active = FALSE,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id AND version = :version
                """, new MapSqlParameterSource()
                .addValue("updatedBy", actor.subject())
                .addValue("id", id)
                .addValue("version", version));
        if (updated == 0) throw new AdminProductConflictException("Product was changed by another admin");
        AdminProductResponse result = required(id);
        writeAudit(id, "ARCHIVE", actor, fields("active"));
        return result;
    }

    private AdminProductResponse required(long id) {
        return findById(id).orElseThrow(() -> new AdminProductNotFoundException(id));
    }

    private Optional<AdminProductResponse> findById(long id) {
        List<AdminProductResponse> results = jdbc.query("""
                SELECT id, slug, name_th, name_en, description_th, description_en,
                       visual_code, type, selection_mode, option_group, option_label_th, option_label_en,
                       price_minor, currency, stock_quantity,
                       bundle_item_count, instant_delivery, catalog_order, active,
                       updated_at, updated_by, version
                FROM products WHERE id = :id
                """, new MapSqlParameterSource("id", id), PRODUCT_ROW);
        return results.stream().findFirst();
    }

    private void ensureUnique(Long id, AdminProductWriteRequest request) {
        if (duplicate("slug", request.slug(), id)
                || duplicate("visual_code", request.visualCode(), id)
                || duplicate("catalog_order", request.catalogOrder(), id)) {
            throw new AdminProductConflictException("Product slug, visual code, or catalog order already exists");
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
                .addValue("descriptionTh", request.descriptionTh().trim())
                .addValue("descriptionEn", request.descriptionEn().trim())
                .addValue("visualCode", request.visualCode().trim())
                .addValue("type", request.type().name())
                .addValue("selectionMode", request.selectionMode().name())
                .addValue("optionGroup", trimOptional(request.optionGroup()))
                .addValue("optionLabelTh", trimOptional(request.optionLabelTh()))
                .addValue("optionLabelEn", trimOptional(request.optionLabelEn()))
                .addValue("priceMinor", request.priceMinor())
                .addValue("currency", request.currency())
                .addValue("stockQuantity", request.stockQuantity())
                .addValue("bundleItemCount", request.bundleItemCount())
                .addValue("instantDelivery", request.instantDelivery())
                .addValue("catalogOrder", request.catalogOrder())
                .addValue("active", request.active())
                .addValue("updatedBy", actor.subject())
                .addValue("version", request.version());
    }

    private static String trimOptional(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static void validateRequest(AdminProductWriteRequest request, boolean create) {
        if (!CURRENCY.equals(request.currency())) {
            throw new InvalidRequestParameterException("currency must be THB");
        }
        if (create && request.version() != 0) {
            throw new InvalidRequestParameterException("new products must use version 0");
        }
        validateSelection(request);
        validateStock(request.type(), request.bundleItemCount());
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

    private static void validateStock(ProductType type, Integer bundleItemCount) {
        if (type == ProductType.SINGLE && bundleItemCount != null) {
            throw new InvalidRequestParameterException("SINGLE products must not have bundleItemCount");
        }
        if (type == ProductType.BUNDLE && (bundleItemCount == null || bundleItemCount < 2)) {
            throw new InvalidRequestParameterException("BUNDLE products require bundleItemCount of at least 2");
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
        if (!current.descriptionTh().equals(request.descriptionTh().trim())) changed.add("descriptionTh");
        if (!current.descriptionEn().equals(request.descriptionEn().trim())) changed.add("descriptionEn");
        if (!current.visualCode().equals(request.visualCode().trim())) changed.add("visualCode");
        if (current.type() != request.type()) changed.add("type");
        if (current.selectionMode() != request.selectionMode()) changed.add("selectionMode");
        if (!java.util.Objects.equals(current.optionGroup(), trimOptional(request.optionGroup()))) changed.add("optionGroup");
        if (!java.util.Objects.equals(current.optionLabelTh(), trimOptional(request.optionLabelTh()))) changed.add("optionLabelTh");
        if (!java.util.Objects.equals(current.optionLabelEn(), trimOptional(request.optionLabelEn()))) changed.add("optionLabelEn");
        if (current.priceMinor() != request.priceMinor()) changed.add("priceMinor");
        if (current.stockQuantity() != request.stockQuantity()) changed.add("stockQuantity");
        if (!java.util.Objects.equals(current.bundleItemCount(), request.bundleItemCount())) changed.add("bundleItemCount");
        if (current.instantDelivery() != request.instantDelivery()) changed.add("instantDelivery");
        if (current.catalogOrder() != request.catalogOrder()) changed.add("catalogOrder");
        if (current.active() != request.active()) changed.add("active");
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
                rs.getString("description_th"),
                rs.getString("description_en"),
                rs.getString("visual_code"),
                ProductType.valueOf(rs.getString("type")),
                ProductSelectionMode.valueOf(rs.getString("selection_mode")),
                rs.getString("option_group"),
                rs.getString("option_label_th"),
                rs.getString("option_label_en"),
                rs.getInt("price_minor"),
                rs.getString("currency"),
                rs.getInt("stock_quantity"),
                rs.getObject("bundle_item_count", Integer.class),
                rs.getBoolean("instant_delivery"),
                rs.getInt("catalog_order"),
                rs.getBoolean("active"),
                updatedAt == null ? Instant.EPOCH : updatedAt.toInstant(),
                rs.getString("updated_by"),
                rs.getLong("version"));
    }

    public record AdminActor(String issuer, String subject) {
    }
}
