package com.plutoshop.api.fulfillment;

import java.time.Instant;
import java.util.List;

public record FulfillmentProfileResponse(
        long productId,
        FulfillmentType fulfillmentType,
        String provider,
        int payloadSchemaVersion,
        String quantityPolicy,
        long version,
        int availableCount,
        int reservedCount,
        int deliveredCount,
        List<FulfillmentStepResponse> steps,
        Instant updatedAt,
        String updatedBy) {

    public FulfillmentProfileResponse {
        steps = steps == null ? List.of() : List.copyOf(steps);
    }
}
