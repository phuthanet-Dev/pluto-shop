package com.plutoshop.api.productimage;

public class ProductImageNotFoundException extends RuntimeException {

    public ProductImageNotFoundException() {
        super("Product image was not found");
    }
}
