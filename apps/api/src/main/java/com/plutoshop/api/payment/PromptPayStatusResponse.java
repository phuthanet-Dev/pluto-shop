package com.plutoshop.api.payment;

import java.time.Instant;

public record PromptPayStatusResponse(
        long orderId,
        String transactionId,
        long amountMinor,
        String currency,
        Instant expiresAt,
        PaymentStatus status,
        String message) {
}
