package com.plutoshop.api.payment;

public class PromptPayUnavailableException extends RuntimeException {

    public PromptPayUnavailableException() {
        super("PromptPay is unavailable during the Bangkok maintenance window");
    }
}
