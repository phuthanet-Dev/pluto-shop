package com.plutoshop.api.admin;

import java.time.Instant;

import com.plutoshop.api.catalog.ProductType;

public record AdminProductResponse(
        Long id,
        String slug,
        String nameTh,
        String nameEn,
        String descriptionTh,
        String descriptionEn,
        String visualCode,
        ProductType type,
        int priceMinor,
        String currency,
        int stockQuantity,
        Integer bundleItemCount,
        boolean instantDelivery,
        int catalogOrder,
        boolean active,
        Instant updatedAt,
        String updatedBy,
        long version) {
}
