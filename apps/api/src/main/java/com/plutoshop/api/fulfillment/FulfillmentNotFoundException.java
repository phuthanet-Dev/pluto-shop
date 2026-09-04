package com.plutoshop.api.fulfillment;

public class FulfillmentNotFoundException extends RuntimeException {

    public FulfillmentNotFoundException(String message) {
        super(message);
    }
}
