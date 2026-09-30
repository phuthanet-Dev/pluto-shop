package com.plutoshop.api.payment;

public record TrueWalletPaymentResponse(
        long orderId,
        String transactionId,
        long amountMinor,
        String currency,
        Long providerAmountMinor,
        PaymentStatus status,
        String message) {
}
