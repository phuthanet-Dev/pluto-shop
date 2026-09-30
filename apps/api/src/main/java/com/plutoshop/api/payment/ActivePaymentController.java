package com.plutoshop.api.payment;

import java.util.Optional;

import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/payments")
public class ActivePaymentController {

    private final PromptPayPaymentService paymentService;

    ActivePaymentController(PromptPayPaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @GetMapping("/active")
    public ResponseEntity<ActivePaymentResponse> getActivePayment(@AuthenticationPrincipal Jwt jwt) {
        Optional<ActivePaymentResponse> activePayment = paymentService.findActivePayment(jwt);
        return activePayment.map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
