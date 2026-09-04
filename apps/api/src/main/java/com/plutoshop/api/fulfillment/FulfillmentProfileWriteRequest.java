package com.plutoshop.api.fulfillment;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record FulfillmentProfileWriteRequest(
        @NotNull FulfillmentType fulfillmentType,
        @Size(max = 64) String provider,
        @Min(1) int payloadSchemaVersion,
        @Min(0) long version,
        @Size(max = 50) List<@Valid FulfillmentStepRequest> steps) {

    public FulfillmentProfileWriteRequest {
        if (steps != null) steps = List.copyOf(steps);
    }
}
