package com.plutoshop.api.admin;

public class AdminProductGroupNotFoundException extends RuntimeException {

    public AdminProductGroupNotFoundException(String optionGroup) {
        super("Multi-option group " + optionGroup + " was not found");
    }
}
