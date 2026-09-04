package com.plutoshop.api.productimage;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;

import java.util.Set;
import java.util.regex.Pattern;

import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.plutoshop.api.catalog.Product;
import com.plutoshop.api.catalog.ProductRepository;

@RestController
@RequestMapping("/api/v1/product-images")
public class ProductImageController {

    private static final Pattern IMAGE_KEY_PATTERN = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/jpeg", "image/png");

    private final ProductRepository repository;
    private final ProductImageStorage storage;

    public ProductImageController(ProductRepository repository, ProductImageStorage storage) {
        this.repository = repository;
        this.storage = storage;
    }

    @GetMapping("/{imageKey}")
    public ResponseEntity<Resource> getImage(@PathVariable String imageKey) {
        if (!isValidImageKey(imageKey)) {
            return notFound();
        }

        Product product = repository.findActiveByImageKey(imageKey).orElse(null);
        if (product == null || !hasSafeMetadata(product)) {
            return notFound();
        }

        try {
            InputStream input = storage.open(imageKey);
            InputStreamResource resource = new InputStreamResource(input);
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(product.getImageContentType()))
                    .contentLength(product.getImageSizeBytes())
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                    .header(HttpHeaders.CACHE_CONTROL, "no-store")
                    .header("X-Content-Type-Options", "nosniff")
                    .body(resource);
        } catch (FileNotFoundException exception) {
            return notFound();
        } catch (IOException | RuntimeException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    private static boolean isValidImageKey(String imageKey) {
        return imageKey != null && IMAGE_KEY_PATTERN.matcher(imageKey).matches();
    }

    private static boolean hasSafeMetadata(Product product) {
        return product.getImageContentType() != null
                && ALLOWED_CONTENT_TYPES.contains(product.getImageContentType())
                && product.getImageSizeBytes() != null
                && product.getImageSizeBytes() > 0
                && product.getImageWidth() != null
                && product.getImageWidth() > 0
                && product.getImageHeight() != null
                && product.getImageHeight() > 0
                && product.getImageSha256() != null;
    }

    private static ResponseEntity<Resource> notFound() {
        return ResponseEntity.notFound().build();
    }
}
