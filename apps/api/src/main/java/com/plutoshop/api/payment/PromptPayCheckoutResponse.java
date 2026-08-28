package com.plutoshop.api.payment;

import java.time.Instant;

public record PromptPayCheckoutResponse(
        long orderId,
        String transactionId,
        long amountMinor,
        String currency,
        String qrUrl,
        String payload,
        Instant expiresAt,
        PaymentStatus status) {
}
