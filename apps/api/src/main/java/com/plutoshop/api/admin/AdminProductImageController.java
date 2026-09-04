package com.plutoshop.api.admin;

import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.plutoshop.api.error.InvalidRequestParameterException;
import com.plutoshop.api.productimage.AdminProductImage;
import com.plutoshop.api.productimage.AdminProductImageService;

@RestController
@RequestMapping("/api/v1/admin/products/{id}/image")
public class AdminProductImageController {

    private final AdminProductImageService service;

    public AdminProductImageController(AdminProductImageService service) {
        this.service = service;
    }

    @GetMapping
    public ResponseEntity<Resource> preview(@PathVariable long id) {
        AdminProductImage image = service.preview(id);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(image.contentType()))
                .contentLength(image.sizeBytes())
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff")
                .body(new InputStreamResource(image.content()));
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AdminProductResponse upload(
            @PathVariable long id,
            @RequestParam long version,
            @RequestPart("file") MultipartFile file,
            @AuthenticationPrincipal Jwt jwt) {
        return service.upload(id, version, file, actor(jwt));
    }

    @DeleteMapping
    public AdminProductResponse delete(
            @PathVariable long id,
            @RequestParam long version,
            @AuthenticationPrincipal Jwt jwt) {
        return service.delete(id, version, actor(jwt));
    }

    private static AdminProductService.AdminActor actor(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new InvalidRequestParameterException("Authenticated admin subject is required");
        }
        return new AdminProductService.AdminActor(jwt.getIssuer().toString(), jwt.getSubject());
    }
}
