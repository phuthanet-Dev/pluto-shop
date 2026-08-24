package com.plutoshop.api.catalog;

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
class Product {

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

    protected Product() {
    }

    Long getId() {
        return id;
    }

    String getSlug() {
        return slug;
    }

    String getNameTh() {
        return nameTh;
    }

    String getNameEn() {
        return nameEn;
    }

    String getDescriptionTh() {
        return descriptionTh;
    }

    String getDescriptionEn() {
        return descriptionEn;
    }

    String getVisualCode() {
        return visualCode;
    }

    ProductType getType() {
        return type;
    }

    int getPriceMinor() {
        return priceMinor;
    }

    String getCurrency() {
        return currency;
    }

    int getStockQuantity() {
        return stockQuantity;
    }

    Integer getBundleItemCount() {
        return bundleItemCount;
    }

    boolean isInstantDelivery() {
        return instantDelivery;
    }

    int getCatalogOrder() {
        return catalogOrder;
    }
}
