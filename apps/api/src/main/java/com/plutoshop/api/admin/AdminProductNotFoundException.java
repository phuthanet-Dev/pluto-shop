package com.plutoshop.api.admin;

public class AdminProductNotFoundException extends RuntimeException {

    public AdminProductNotFoundException(long id) {
        super("Product " + id + " was not found");
    }
}
