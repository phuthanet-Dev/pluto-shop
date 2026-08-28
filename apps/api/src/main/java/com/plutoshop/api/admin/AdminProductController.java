package com.plutoshop.api.admin;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

import com.plutoshop.api.error.InvalidRequestParameterException;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/admin/products")
@Validated
public class AdminProductController {

    private final AdminProductService service;

    AdminProductController(AdminProductService service) {
        this.service = service;
    }

    @GetMapping
    public AdminProductListResponse list(@RequestParam(required = false) String q) {
        if (q != null && q.trim().length() > 120) {
            throw new InvalidRequestParameterException("q must not exceed 120 characters");
        }
        return service.list(q);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AdminProductResponse create(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AdminProductWriteRequest request) {
        return service.create(request, actor(jwt));
    }

    @PatchMapping("/{id}")
    public AdminProductResponse update(
            @PathVariable long id,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AdminProductWriteRequest request) {
        return service.update(id, request, actor(jwt));
    }

    @PatchMapping("/{id}/stock")
    public AdminProductResponse updateStock(
            @PathVariable long id,
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody AdminStockUpdateRequest request) {
        return service.updateStock(id, request, actor(jwt));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable long id,
            @RequestParam long version,
            @AuthenticationPrincipal Jwt jwt) {
        service.delete(id, version, actor(jwt));
    }

    private static AdminProductService.AdminActor actor(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new InvalidRequestParameterException("Authenticated admin subject is required");
        }
        return new AdminProductService.AdminActor(jwt.getIssuer().toString(), jwt.getSubject());
    }
}
