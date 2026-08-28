package com.plutoshop.api.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        prefix = "payment.inwcloud",
        name = "expiry-sweep-enabled",
        havingValue = "true",
        matchIfMissing = true)
public class PromptPayPaymentExpiryJob {

    private final PromptPayPaymentService paymentService;

    PromptPayPaymentExpiryJob(PromptPayPaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @Scheduled(
            fixedDelayString = "${payment.inwcloud.expiry-sweep-delay-ms:60000}",
            initialDelayString = "${payment.inwcloud.expiry-sweep-initial-delay-ms:60000}")
    public void sweep() {
        paymentService.sweepExpiredPayments();
    }
}
