package com.plutoshop.api.productimage;

public class ProductImageTooLargeException extends ProductImageValidationException {

    public ProductImageTooLargeException(String message) {
        super(message);
    }
}
