package com.plutoshop.api.catalog;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.plutoshop.api.catalog.ProductCatalogResponse.PriceRange;
import com.plutoshop.api.catalog.ProductCatalogResponse.ProductItem;

@Service
class ProductCatalogService {

    private static final String CURRENCY = "THB";

    private final ProductRepository repository;

    ProductCatalogService(ProductRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    ProductCatalogResponse getCatalog(String query, Integer maxPriceMinor, Boolean inStock) {
        String queryPattern = normalizeQuery(query);
        List<ProductItem> items = repository.findCatalog(queryPattern, maxPriceMinor, inStock).stream()
                .map(this::toItem)
                .toList();
        ProductRepository.CatalogPriceRange catalogRange = repository.findCatalogPriceRange();
        int minMinor = catalogRange.getMinMinor() == null ? 0 : catalogRange.getMinMinor();
        int maxMinor = catalogRange.getMaxMinor() == null ? 0 : catalogRange.getMaxMinor();

        return new ProductCatalogResponse(
                items,
                items.size(),
                new PriceRange(minMinor, maxMinor, CURRENCY));
    }

    private static String normalizeQuery(String query) {
        if (query == null || query.isBlank()) {
            return null;
        }
        String normalized = query.trim().toLowerCase(Locale.ROOT);
        String escaped = normalized
                .replace("\\", "\\\\")
                .replace("%", "\\%")
                .replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private ProductItem toItem(Product product) {
        ProductOptionGroup group = product.getOptionGroupMetadata();
        String nameTh = group == null ? product.getNameTh() : group.getNameTh();
        String nameEn = group == null ? product.getNameEn() : group.getNameEn();
        String shortDescriptionTh = group == null
                ? product.getShortDescriptionTh()
                : group.getShortDescriptionTh();
        String shortDescriptionEn = group == null
                ? product.getShortDescriptionEn()
                : group.getShortDescriptionEn();
        return new ProductItem(
                product.getId(),
                product.getSlug(),
                nameTh,
                nameEn,
                product.getDescriptionTh(),
                product.getDescriptionEn(),
                shortDescriptionTh,
                shortDescriptionEn,
                product.getSelectionMode(),
                product.getOptionGroup(),
                product.getOptionLabelTh(),
                product.getOptionLabelEn(),
                product.getPriceMinor(),
                product.getCurrency(),
                product.getStockQuantity(),
                product.getDeliveryType(),
                product.getWarrantyDays(),
                product.isInstantDelivery(),
                product.getCatalogOrder(),
                product.getImageKey() == null ? null : "/api/v1/product-images/" + product.getImageKey());
    }
}
