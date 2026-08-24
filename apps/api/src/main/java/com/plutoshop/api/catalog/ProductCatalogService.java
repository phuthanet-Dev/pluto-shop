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
                .map(ProductCatalogService::toItem)
                .toList();
        ProductRepository.CatalogPriceRange catalogRange = repository.findCatalogPriceRange();

        return new ProductCatalogResponse(
                items,
                items.size(),
                new PriceRange(catalogRange.getMinMinor(), catalogRange.getMaxMinor(), CURRENCY));
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

    private static ProductItem toItem(Product product) {
        return new ProductItem(
                product.getId(),
                product.getSlug(),
                product.getNameTh(),
                product.getNameEn(),
                product.getDescriptionTh(),
                product.getDescriptionEn(),
                product.getVisualCode(),
                product.getType(),
                product.getPriceMinor(),
                product.getCurrency(),
                product.getStockQuantity(),
                product.getBundleItemCount(),
                product.isInstantDelivery(),
                product.getCatalogOrder());
    }
}
