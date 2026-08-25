package com.plutoshop.api.cart;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CartWriteRequest(
        @NotNull @Size(max = 100) List<@Valid CartItemRequest> items) {
}
