package com.plutoshop.api.fulfillment;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/orders/{orderId}/fulfillment")
public class FulfillmentCustomerController {

    private final FulfillmentCustomerService customerService;

    public FulfillmentCustomerController(FulfillmentCustomerService customerService) {
        this.customerService = customerService;
    }

    @GetMapping
    public ResponseEntity<CustomerFulfillmentResponse> getOrderFulfillment(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long orderId) {
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue())
                .body(customerService.getOrderFulfillment(jwt, orderId));
    }

    @PostMapping("/items/{orderItemId}/reveal")
    public ResponseEntity<FulfillmentRevealResponse> reveal(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable long orderId,
            @PathVariable long orderItemId) {
        FulfillmentRevealResponse response = customerService.reveal(jwt, orderId, orderItemId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue())
                .body(response);
    }
}
