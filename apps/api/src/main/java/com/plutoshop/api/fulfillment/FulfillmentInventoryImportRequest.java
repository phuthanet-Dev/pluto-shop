package com.plutoshop.api.fulfillment;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public record FulfillmentInventoryImportRequest(
        @NotEmpty
        @Size(max = 100)
        List<@Valid FulfillmentInventoryWriteRequest> items) {

    public FulfillmentInventoryImportRequest {
        items = items == null ? List.of() : List.copyOf(items);
    }
}
