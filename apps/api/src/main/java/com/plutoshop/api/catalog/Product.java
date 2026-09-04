package com.plutoshop.api.catalog;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.JdbcTypeCode;

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    @Column(name = "name_th", nullable = false, length = 180)
    private String nameTh;

    @Column(name = "name_en", nullable = false, length = 180)
    private String nameEn;

    @Column(name = "description_th", nullable = false, length = 1000)
    private String descriptionTh;

    @Column(name = "description_en", nullable = false, length = 1000)
    private String descriptionEn;

    @Column(name = "short_description_th", nullable = false, length = 500)
    private String shortDescriptionTh;

    @Column(name = "short_description_en", nullable = false, length = 500)
    private String shortDescriptionEn;

    @Enumerated(EnumType.STRING)
    @Column(name = "selection_mode", nullable = false, length = 16)
    private ProductSelectionMode selectionMode;

    @Column(name = "option_group", length = 120)
    private String optionGroup;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "option_group", referencedColumnName = "option_group", insertable = false, updatable = false)
    private ProductOptionGroup optionGroupMetadata;

    @Column(name = "option_label_th", length = 180)
    private String optionLabelTh;

    @Column(name = "option_label_en", length = 180)
    private String optionLabelEn;

    @Column(name = "price_minor", nullable = false)
    private int priceMinor;

    @Column(nullable = false, length = 3)
    private String currency;

    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    @Column(name = "instant_delivery", nullable = false)
    private boolean instantDelivery;

    @Enumerated(EnumType.STRING)
    @Column(name = "delivery_type", nullable = false, length = 16)
    private ProductDeliveryType deliveryType;

    @Column(name = "warranty_days", nullable = false)
    private int warrantyDays;

    @Column(name = "stock_warning_threshold", nullable = false)
    private int stockWarningThreshold;

    @Column(name = "catalog_order", nullable = false, unique = true)
    private int catalogOrder;

    @Column(nullable = false)
    private boolean active;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ProductStatus status;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    @Column(name = "image_key", unique = true, length = 80)
    private String imageKey;

    @Column(name = "image_content_type", length = 32)
    private String imageContentType;

    @Column(name = "image_size_bytes")
    private Long imageSizeBytes;

    @Column(name = "image_width")
    private Integer imageWidth;

    @Column(name = "image_height")
    private Integer imageHeight;

    @JdbcTypeCode(java.sql.Types.CHAR)
    @Column(name = "image_sha256", columnDefinition = "char(64)")
    private String imageSha256;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private String updatedBy;

    @jakarta.persistence.Version
    @Column(nullable = false)
    private long version;

    protected Product() {
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getNameTh() {
        return nameTh;
    }

    public String getNameEn() {
        return nameEn;
    }

    public String getDescriptionTh() {
        return descriptionTh;
    }

    public String getDescriptionEn() {
        return descriptionEn;
    }

    public String getShortDescriptionTh() {
        return shortDescriptionTh;
    }

    public String getShortDescriptionEn() {
        return shortDescriptionEn;
    }

    public ProductSelectionMode getSelectionMode() {
        return selectionMode;
    }

    public String getOptionGroup() {
        return optionGroup;
    }

    public ProductOptionGroup getOptionGroupMetadata() {
        return optionGroupMetadata;
    }

    public String getOptionLabelTh() {
        return optionLabelTh;
    }

    public String getOptionLabelEn() {
        return optionLabelEn;
    }

    public int getPriceMinor() {
        return priceMinor;
    }

    public String getCurrency() {
        return currency;
    }

    public int getStockQuantity() {
        return stockQuantity;
    }

    public boolean isInstantDelivery() {
        return instantDelivery;
    }

    public ProductDeliveryType getDeliveryType() {
        return deliveryType;
    }

    public int getWarrantyDays() {
        return warrantyDays;
    }

    public int getStockWarningThreshold() {
        return stockWarningThreshold;
    }

    public int getCatalogOrder() {
        return catalogOrder;
    }

    public boolean isActive() {
        return active;
    }

    public ProductStatus getStatus() {
        return status;
    }

    public int getSortOrder() {
        return sortOrder;
    }

    public String getImageKey() {
        return imageKey;
    }

    public String getImageContentType() {
        return imageContentType;
    }

    public Long getImageSizeBytes() {
        return imageSizeBytes;
    }

    public Integer getImageWidth() {
        return imageWidth;
    }

    public Integer getImageHeight() {
        return imageHeight;
    }

    public String getImageSha256() {
        return imageSha256;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public long getVersion() {
        return version;
    }
}
