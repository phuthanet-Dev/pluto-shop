package com.plutoshop.api.productimage;

public record ProductImageMetadata(
        String key,
        String contentType,
        long sizeBytes,
        int width,
        int height,
        String sha256) {
}
