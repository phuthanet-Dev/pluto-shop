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
            String visualCode,
            ProductType type,
            int priceMinor,
            String currency,
            int stockQuantity,
            Integer bundleItemCount,
            boolean instantDelivery,
            int catalogOrder) {
    }

    public record PriceRange(int minMinor, int maxMinor, String currency) {
    }
}
