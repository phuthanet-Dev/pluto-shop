package com.plutoshop.api.fulfillment;

import java.util.List;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.plutoshop.api.admin.AdminProductService;
import com.plutoshop.api.error.InvalidRequestParameterException;

@RestController
@RequestMapping("/api/v1/admin/fulfillments")
@Validated
public class FulfillmentAdminOrderController {

    private final FulfillmentAdminService service;

    public FulfillmentAdminOrderController(FulfillmentAdminService service) {
        this.service = service;
    }

    @GetMapping
    public List<FulfillmentAdminOrderResponse> listManualFulfillments(
            @RequestParam(required = false) OrderFulfillmentStatus status) {
        return service.listManualFulfillments(status);
    }

    @PostMapping("/{fulfillmentId}/ready")
    public FulfillmentAdminOrderResponse markManualReady(
            @PathVariable long fulfillmentId,
            @AuthenticationPrincipal Jwt jwt) {
        return service.markManualReady(fulfillmentId, actor(jwt));
    }

    @PostMapping("/{fulfillmentId}/deliver")
    public FulfillmentAdminOrderResponse deliverManual(
            @PathVariable long fulfillmentId,
            @AuthenticationPrincipal Jwt jwt) {
        return service.deliverManual(fulfillmentId, actor(jwt));
    }

    @PostMapping("/{fulfillmentId}/retry")
    public FulfillmentAdminOrderResponse retry(
            @PathVariable long fulfillmentId,
            @AuthenticationPrincipal Jwt jwt) {
        return service.retryFulfillment(fulfillmentId, actor(jwt));
    }

    private static AdminProductService.AdminActor actor(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new InvalidRequestParameterException("Authenticated admin subject is required");
        }
        return new AdminProductService.AdminActor(jwt.getIssuer().toString(), jwt.getSubject());
    }
}
