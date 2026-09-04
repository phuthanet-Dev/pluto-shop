package com.plutoshop.api.productimage;

import java.io.InputStream;

public record AdminProductImage(InputStream content, String contentType, long sizeBytes) {
}
