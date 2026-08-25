package com.plutoshop.api.catalog;

import java.util.List;

import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public interface ProductRepository extends Repository<Product, Long> {

    List<Product> findAllById(Iterable<Long> ids);

    @Query("""
            select p from Product p
            where (
                  :queryPattern is null
               or lower(p.nameTh) like :queryPattern escape '\\'
               or lower(p.nameEn) like :queryPattern escape '\\'
               or lower(p.descriptionTh) like :queryPattern escape '\\'
               or lower(p.descriptionEn) like :queryPattern escape '\\'
            )
              and (:maxPriceMinor is null or p.priceMinor <= :maxPriceMinor)
              and (
                    :inStock is null
                 or (:inStock = true and p.stockQuantity > 0)
                 or (:inStock = false and p.stockQuantity = 0)
              )
            order by p.catalogOrder
            """)
    List<Product> findCatalog(
            @Param("queryPattern") String queryPattern,
            @Param("maxPriceMinor") Integer maxPriceMinor,
            @Param("inStock") Boolean inStock);

    @Query("select min(p.priceMinor) as minMinor, max(p.priceMinor) as maxMinor from Product p")
    CatalogPriceRange findCatalogPriceRange();

    interface CatalogPriceRange {
        Integer getMinMinor();

        Integer getMaxMinor();
    }
}
