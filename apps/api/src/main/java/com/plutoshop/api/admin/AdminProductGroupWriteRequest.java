package com.plutoshop.api.admin;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AdminProductGroupWriteRequest(
        @NotBlank @Size(max = 180) String nameTh,
        @NotBlank @Size(max = 180) String nameEn,
        @NotBlank @Size(max = 500) String shortDescriptionTh,
        @NotBlank @Size(max = 500) String shortDescriptionEn,
        @NotNull @Min(0) Long version) {
}
