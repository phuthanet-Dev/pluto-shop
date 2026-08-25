package com.plutoshop.api.cart;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/cart")
@Validated
public class CartController {

    private final CartService service;

    CartController(CartService service) {
        this.service = service;
    }

    @GetMapping
    public CartResponse getCart(@AuthenticationPrincipal Jwt jwt) {
        return service.getCart(jwt);
    }

    @PutMapping
    public CartResponse replace(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CartWriteRequest request) {
        return service.replace(jwt, request);
    }

    @PostMapping("/merge")
    public CartResponse merge(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody CartWriteRequest request) {
        return service.merge(jwt, request);
    }

    @DeleteMapping
    public void clear(@AuthenticationPrincipal Jwt jwt) {
        service.clear(jwt);
    }
}
