package com.plutoshop.api.cart;

public class CartLockedException extends RuntimeException {

    public CartLockedException() {
        super("Cart is locked while a payment is pending");
    }
}
