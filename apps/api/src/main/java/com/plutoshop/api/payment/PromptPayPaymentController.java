package com.plutoshop.api.payment;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class PromptPayPaymentController {

    private final PromptPayPaymentService service;

    PromptPayPaymentController(PromptPayPaymentService service) {
        this.service = service;
    }

    @PostMapping("/checkout/promptpay")
    public PromptPayCheckoutResponse createPromptPay(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") String idempotencyKey) {
        return service.createPromptPay(jwt, idempotencyKey);
    }

    @PostMapping("/payments/promptpay/{transactionId}/check")
    public PromptPayStatusResponse checkPromptPay(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable String transactionId) {
        return service.checkPromptPay(jwt, transactionId);
    }
}
