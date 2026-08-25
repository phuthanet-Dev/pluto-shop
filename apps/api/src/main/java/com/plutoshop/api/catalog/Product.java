package com.plutoshop.api.catalog;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

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

    @Column(name = "visual_code", nullable = false, unique = true, length = 80)
    private String visualCode;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private ProductType type;

    @Enumerated(EnumType.STRING)
    @Column(name = "selection_mode", nullable = false, length = 16)
    private ProductSelectionMode selectionMode;

    @Column(name = "option_group", length = 120)
    private String optionGroup;

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

    @Column(name = "bundle_item_count")
    private Integer bundleItemCount;

    @Column(name = "instant_delivery", nullable = false)
    private boolean instantDelivery;

    @Column(name = "catalog_order", nullable = false, unique = true)
    private int catalogOrder;

    @Column(nullable = false)
    private boolean active;

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

    public String getVisualCode() {
        return visualCode;
    }

    public ProductType getType() {
        return type;
    }

    public ProductSelectionMode getSelectionMode() {
        return selectionMode;
    }

    public String getOptionGroup() {
        return optionGroup;
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

    public Integer getBundleItemCount() {
        return bundleItemCount;
    }

    public boolean isInstantDelivery() {
        return instantDelivery;
    }

    public int getCatalogOrder() {
        return catalogOrder;
    }

    public boolean isActive() {
        return active;
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
