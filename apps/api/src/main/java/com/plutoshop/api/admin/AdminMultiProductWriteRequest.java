package com.plutoshop.api.admin;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record AdminMultiProductWriteRequest(
        @NotNull @Size(min = 2, max = 100) List<@NotNull @Valid AdminProductWriteRequest> items,
        @Valid AdminProductGroupWriteRequest group) {
}
