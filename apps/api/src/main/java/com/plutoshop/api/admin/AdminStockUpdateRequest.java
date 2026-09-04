package com.plutoshop.api.admin;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record AdminStockUpdateRequest(
        @Min(0) int stockQuantity,
        @NotNull @Min(0) Long version) {
}
