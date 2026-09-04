package com.plutoshop.api.admin;

import com.plutoshop.api.catalog.ProductSelectionMode;
import com.plutoshop.api.catalog.ProductDeliveryType;
import com.plutoshop.api.catalog.ProductStatus;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record AdminProductWriteRequest(
        @NotBlank @Size(max = 120) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String slug,
        @NotBlank @Size(max = 180) String nameTh,
        @NotBlank @Size(max = 180) String nameEn,
        @NotBlank @Size(max = 500) String shortDescriptionTh,
        @NotBlank @Size(max = 500) String shortDescriptionEn,
        @NotBlank @Size(max = 1000) String descriptionTh,
        @NotBlank @Size(max = 1000) String descriptionEn,
        @NotNull ProductSelectionMode selectionMode,
        @Size(max = 120) @Pattern(regexp = "[a-z0-9]+(?:-[a-z0-9]+)*") String optionGroup,
        @Size(max = 180) String optionLabelTh,
        @Size(max = 180) String optionLabelEn,
        @Min(0) int priceMinor,
        @NotNull @Pattern(regexp = "THB") String currency,
        @Min(0) int stockQuantity,
        @NotNull ProductDeliveryType deliveryType,
        @Min(0) int warrantyDays,
        @Min(0) int stockWarningThreshold,
        @NotNull ProductStatus status,
        @Positive int sortOrder,
        @Min(0) long version) {
}
