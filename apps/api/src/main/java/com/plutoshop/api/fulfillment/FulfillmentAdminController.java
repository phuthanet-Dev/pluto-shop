package com.plutoshop.api.fulfillment;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.plutoshop.api.admin.AdminProductService;
import com.plutoshop.api.error.InvalidRequestParameterException;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/admin/products/{productId}/fulfillment")
@Validated
public class FulfillmentAdminController {

    private final FulfillmentAdminService service;

    FulfillmentAdminController(FulfillmentAdminService service) {
        this.service = service;
    }

    @GetMapping
    public FulfillmentProfileResponse getProfile(@PathVariable long productId) {
        return service.getProfile(productId);
    }

    @PutMapping
    public FulfillmentProfileResponse updateProfile(
            @PathVariable long productId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentProfileWriteRequest request) {
        return service.updateProfile(productId, request, actor(jwt));
    }

    @GetMapping("/inventory")
    public FulfillmentInventoryListResponse listInventory(@PathVariable long productId) {
        return service.listInventory(productId);
    }

    @PostMapping("/inventory")
    @ResponseStatus(HttpStatus.CREATED)
    public FulfillmentInventoryResponse addInventory(
            @PathVariable long productId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentInventoryWriteRequest request) {
        return service.addInventory(productId, request, actor(jwt));
    }

    @PostMapping("/inventory/import")
    @ResponseStatus(HttpStatus.CREATED)
    public FulfillmentInventoryListResponse importInventory(
            @PathVariable long productId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentInventoryImportRequest request) {
        return service.importInventory(productId, request, actor(jwt));
    }

    @PostMapping("/inventory/{inventoryId}/revoke")
    public FulfillmentInventoryResponse revokeInventory(
            @PathVariable long productId,
            @PathVariable long inventoryId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentAdminRevealRequest request) {
        return service.revokeInventory(productId, inventoryId, actor(jwt), request.requiredReason());
    }

    @PostMapping("/inventory/{inventoryId}/quarantine")
    public FulfillmentInventoryResponse quarantineInventory(
            @PathVariable long productId,
            @PathVariable long inventoryId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentAdminRevealRequest request) {
        return service.quarantineInventory(productId, inventoryId, actor(jwt), request.requiredReason());
    }

    @PostMapping("/inventory/{inventoryId}/reveal")
    public ResponseEntity<FulfillmentRevealResponse> revealInventory(
            @PathVariable long productId,
            @PathVariable long inventoryId,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody FulfillmentAdminRevealRequest request) {
        FulfillmentRevealResponse response = service.revealInventory(
                productId, inventoryId, actor(jwt), request.requiredReason());
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.PRAGMA, "no-cache")
                .body(response);
    }

    private static AdminProductService.AdminActor actor(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new InvalidRequestParameterException("Authenticated admin subject is required");
        }
        return new AdminProductService.AdminActor(jwt.getIssuer().toString(), jwt.getSubject());
    }
}
