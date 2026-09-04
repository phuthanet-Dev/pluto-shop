package com.plutoshop.api.fulfillment;

import java.util.Map;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FulfillmentInventoryWriteRequest(
        @NotNull FulfillmentType fulfillmentType,
        @NotNull @Size(min = 1, max = 64) String provider,
        @NotEmpty @Size(max = 20) Map<String, @Size(max = 2048) String> payload,
        @Size(max = 20) Map<String, @Size(max = 200) String> publicMetadata) {

    public FulfillmentInventoryWriteRequest {
        if (payload != null) payload = Map.copyOf(payload);
        if (publicMetadata != null) publicMetadata = Map.copyOf(publicMetadata);
    }
}
