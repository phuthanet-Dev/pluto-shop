package com.plutoshop.api.admin;

import java.time.Instant;

import com.plutoshop.api.catalog.ProductSelectionMode;
import com.plutoshop.api.catalog.ProductDeliveryType;
import com.plutoshop.api.catalog.ProductStatus;

public record AdminProductResponse(
        Long id,
        String slug,
        String nameTh,
        String nameEn,
        String shortDescriptionTh,
        String shortDescriptionEn,
        String descriptionTh,
        String descriptionEn,
        ProductSelectionMode selectionMode,
        String optionGroup,
        String optionLabelTh,
        String optionLabelEn,
        int priceMinor,
        String currency,
        int stockQuantity,
        ProductDeliveryType deliveryType,
        int warrantyDays,
        int stockWarningThreshold,
        ProductStatus status,
        int sortOrder,
        boolean hasImage,
        String imageContentType,
        Long imageSizeBytes,
        Integer imageWidth,
        Integer imageHeight,
        Instant updatedAt,
        String updatedBy,
        long version) {
}
