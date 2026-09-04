package com.plutoshop.api.fulfillment;

public class FulfillmentSecretException extends RuntimeException {

    public FulfillmentSecretException(String message) {
        super(message);
    }

    public FulfillmentSecretException(String message, Throwable cause) {
        super(message, cause);
    }
}
