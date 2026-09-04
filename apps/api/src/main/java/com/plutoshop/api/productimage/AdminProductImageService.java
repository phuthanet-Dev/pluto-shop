package com.plutoshop.api.productimage;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.sql.ResultSet;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import com.plutoshop.api.admin.AdminProductConflictException;
import com.plutoshop.api.admin.AdminProductResponse;
import com.plutoshop.api.admin.AdminProductService;

import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminProductImageService {

    private static final Logger LOGGER = LoggerFactory.getLogger(AdminProductImageService.class);

    private final NamedParameterJdbcTemplate jdbc;
    private final AdminProductService productService;
    private final ProductImageStorage storage;

    public AdminProductImageService(
            @Qualifier("adminJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            AdminProductService productService,
            ProductImageStorage storage) {
        this.jdbc = jdbc;
        this.productService = productService;
        this.storage = storage;
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse upload(
            long id, long version, MultipartFile file, AdminProductService.AdminActor actor) {
        AdminProductResponse current = productService.requireForImage(id);
        requireVersion(current, version);
        if (file == null || file.isEmpty()) {
            throw new ProductImageValidationException("Image file is required");
        }

        String previousKey = imageKey(id);
        ProductImageMetadata stored = null;
        boolean cleanupRegistered = false;
        try {
            try (InputStream input = file.getInputStream()) {
                stored = storage.store(input, file.getContentType());
            } catch (ProductImageValidationException exception) {
                throw exception;
            } catch (IOException exception) {
                throw new ProductImageStorageException(exception);
            }

            int updated = jdbc.update("""
                    UPDATE products
                    SET image_key = :imageKey,
                        image_content_type = :imageContentType,
                        image_size_bytes = :imageSizeBytes,
                        image_width = :imageWidth,
                        image_height = :imageHeight,
                        image_sha256 = :imageSha256,
                        updated_at = CURRENT_TIMESTAMP,
                        updated_by = :updatedBy,
                        version = version + 1
                    WHERE id = :id AND version = :version
                    """, new MapSqlParameterSource()
                    .addValue("imageKey", stored.key())
                    .addValue("imageContentType", stored.contentType())
                    .addValue("imageSizeBytes", stored.sizeBytes())
                    .addValue("imageWidth", stored.width())
                    .addValue("imageHeight", stored.height())
                    .addValue("imageSha256", stored.sha256())
                    .addValue("updatedBy", actor.subject())
                    .addValue("id", id)
                    .addValue("version", version));
            if (updated == 0) {
                throw new AdminProductConflictException("Product was changed by another admin");
            }

            writeAudit(id, actor);
            registerCleanup(previousKey, stored.key());
            cleanupRegistered = true;
            return productService.requireForImage(id);
        } catch (RuntimeException exception) {
            if (stored != null && !cleanupRegistered) {
                deleteQuietly(stored.key());
            }
            throw exception;
        }
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductResponse delete(
            long id, long version, AdminProductService.AdminActor actor) {
        AdminProductResponse current = productService.requireForImage(id);
        requireVersion(current, version);
        String previousKey = imageKey(id);
        if (!current.hasImage() || previousKey == null) {
            throw new ProductImageNotFoundException();
        }

        int updated = jdbc.update("""
                UPDATE products
                SET image_key = NULL,
                    image_content_type = NULL,
                    image_size_bytes = NULL,
                    image_width = NULL,
                    image_height = NULL,
                    image_sha256 = NULL,
                    updated_at = CURRENT_TIMESTAMP,
                    updated_by = :updatedBy,
                    version = version + 1
                WHERE id = :id AND version = :version
                """, new MapSqlParameterSource()
                .addValue("updatedBy", actor.subject())
                .addValue("id", id)
                .addValue("version", version));
        if (updated == 0) {
            throw new AdminProductConflictException("Product was changed by another admin");
        }

        writeAudit(id, actor);
        registerCleanup(previousKey, null);
        return productService.requireForImage(id);
    }

    @Transactional(transactionManager = "adminTransactionManager")
    public AdminProductImage preview(long id) {
        ProductImagePreviewMetadata image = jdbc.query(
                """
                SELECT image_key, image_content_type, image_size_bytes
                FROM products
                WHERE id = :id
                """,
                new MapSqlParameterSource("id", id),
                (ResultSet resultSet, int rowNum) -> new ProductImagePreviewMetadata(
                        resultSet.getString("image_key"),
                        resultSet.getString("image_content_type"),
                        resultSet.getObject("image_size_bytes", Long.class)))
                .stream()
                .findFirst()
                .orElseThrow(ProductImageNotFoundException::new);
        if (image.key() == null || image.contentType() == null || image.sizeBytes() == null) {
            throw new ProductImageNotFoundException();
        }
        try {
            return new AdminProductImage(
                    storage.open(image.key()), image.contentType(), image.sizeBytes());
        } catch (FileNotFoundException exception) {
            throw new ProductImageNotFoundException();
        } catch (IOException exception) {
            throw new ProductImageStorageException(exception);
        }
    }

    private String imageKey(long id) {
        List<String> keys = jdbc.query(
                "SELECT image_key FROM products WHERE id = :id",
                new MapSqlParameterSource("id", id),
                (ResultSet resultSet, int rowNum) -> resultSet.getString("image_key"));
        return keys.isEmpty() ? null : keys.get(0);
    }

    private void writeAudit(long id, AdminProductService.AdminActor actor) {
        jdbc.update("""
                INSERT INTO product_audit_log (product_id, action, actor_issuer, actor_subject, changed_fields)
                VALUES (:productId, 'UPDATE', :actorIssuer, :actorSubject, CAST(:changedFields AS jsonb))
                """, new MapSqlParameterSource()
                .addValue("productId", id)
                .addValue("actorIssuer", actor.issuer())
                .addValue("actorSubject", actor.subject())
                .addValue("changedFields", "{\"fields\":[\"image\"]}"));
    }

    private void registerCleanup(String previousKey, String newKey) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new ProductImageStorageException(
                    new IllegalStateException("Product image transaction synchronization is unavailable"));
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                deleteQuietly(previousKey);
            }

            @Override
            public void afterCompletion(int status) {
                if (status != TransactionSynchronization.STATUS_COMMITTED) {
                    deleteQuietly(newKey);
                }
            }
        });
    }

    private void deleteQuietly(String key) {
        if (key == null) {
            return;
        }
        try {
            storage.delete(key);
        } catch (IOException | RuntimeException exception) {
            LOGGER.warn("Could not clean product image key {} after transaction", key);
        }
    }

    private static void requireVersion(AdminProductResponse current, long version) {
        if (current.version() != version) {
            throw new AdminProductConflictException("Product was changed by another admin");
        }
    }
}
