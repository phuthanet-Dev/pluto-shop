package com.plutoshop.api.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.plutoshop.api.error.InvalidRequestParameterException;

@RestController
@RequestMapping("/api/v1/products")
class ProductCatalogController {

    private final ProductCatalogService service;

    ProductCatalogController(ProductCatalogService service) {
        this.service = service;
    }

    @GetMapping
    ProductCatalogResponse getProducts(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String maxPriceMinor,
            @RequestParam(required = false) String inStock) {
        String normalizedQuery = q == null ? null : q.trim();
        if (normalizedQuery != null && normalizedQuery.length() > 120) {
            throw new InvalidRequestParameterException("q must not exceed 120 characters");
        }
        return service.getCatalog(
                normalizedQuery,
                parseMaxPriceMinor(maxPriceMinor),
                parseInStock(inStock));
    }

    private static Integer parseMaxPriceMinor(String value) {
        if (value == null) {
            return null;
        }
        if (!value.matches("-?\\d+")) {
            throw new InvalidRequestParameterException("maxPriceMinor must be a whole number");
        }

        final long parsed;
        try {
            parsed = Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw new InvalidRequestParameterException("maxPriceMinor must be a whole number");
        }
        if (parsed < 0) {
            throw new InvalidRequestParameterException(
                    "maxPriceMinor must be greater than or equal to 0");
        }
        if (parsed > Integer.MAX_VALUE) {
            throw new InvalidRequestParameterException("maxPriceMinor is too large");
        }
        return (int) parsed;
    }

    private static Boolean parseInStock(String value) {
        if (value == null) {
            return null;
        }
        return switch (value) {
            case "true" -> true;
            case "false" -> false;
            default -> throw new InvalidRequestParameterException("inStock must be true or false");
        };
    }
}
