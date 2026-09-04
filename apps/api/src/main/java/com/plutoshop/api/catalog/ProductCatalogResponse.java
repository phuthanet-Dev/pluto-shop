package com.plutoshop.api.catalog;

import java.util.List;

public record ProductCatalogResponse(
        List<ProductItem> items,
        long total,
        PriceRange priceRange) {

    public record ProductItem(
            Long id,
            String slug,
            String nameTh,
            String nameEn,
            String descriptionTh,
            String descriptionEn,
            String shortDescriptionTh,
            String shortDescriptionEn,
            ProductSelectionMode selectionMode,
            String optionGroup,
            String optionLabelTh,
            String optionLabelEn,
            int priceMinor,
            String currency,
            int stockQuantity,
            ProductDeliveryType deliveryType,
            int warrantyDays,
            boolean instantDelivery,
            int catalogOrder,
            String imageUrl) {
    }

    public record PriceRange(int minMinor, int maxMinor, String currency) {
    }
}
