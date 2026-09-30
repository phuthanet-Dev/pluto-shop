package com.plutoshop.api.payment;

import java.time.Instant;

public record ActivePaymentResponse(
        String paymentMethod,
        long orderId,
        String transactionId,
        long amountMinor,
        String currency,
        PaymentStatus status,
        String message,
        String qrUrl,
        String payload,
        Instant expiresAt) {
}
