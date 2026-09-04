package com.plutoshop.api.productimage;

public class ProductImageStorageException extends RuntimeException {

    public ProductImageStorageException(Throwable cause) {
        super("Product image storage is unavailable", cause);
    }
}
