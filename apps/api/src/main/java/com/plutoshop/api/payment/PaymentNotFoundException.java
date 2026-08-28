package com.plutoshop.api.payment;

public class PaymentNotFoundException extends RuntimeException {

    public PaymentNotFoundException() {
        super("Payment transaction was not found");
    }
}
