package com.plutoshop.api.admin;

import java.time.Instant;

import com.plutoshop.api.catalog.ProductType;
import com.plutoshop.api.catalog.ProductSelectionMode;

public record AdminProductResponse(
        Long id,
        String slug,
        String nameTh,
        String nameEn,
        String descriptionTh,
        String descriptionEn,
        String visualCode,
        ProductType type,
        ProductSelectionMode selectionMode,
        String optionGroup,
        String optionLabelTh,
        String optionLabelEn,
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
