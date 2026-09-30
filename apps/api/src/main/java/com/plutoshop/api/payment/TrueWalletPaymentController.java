package com.plutoshop.api.payment;

import jakarta.validation.Valid;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1")
public class TrueWalletPaymentController {

    private final TrueWalletPaymentService service;

    public TrueWalletPaymentController(TrueWalletPaymentService service) {
        this.service = service;
    }

    @PostMapping("/checkout/truewallet")
    public TrueWalletPaymentResponse redeemTrueWallet(
            @AuthenticationPrincipal Jwt jwt,
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody TrueWalletRedeemRequest request) {
        return service.redeemTrueWallet(jwt, idempotencyKey, request);
    }
}
