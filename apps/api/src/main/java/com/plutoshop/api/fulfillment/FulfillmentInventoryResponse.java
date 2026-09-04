package com.plutoshop.api.fulfillment;

import java.time.Instant;
import java.util.Map;

public record FulfillmentInventoryResponse(
        long id,
        FulfillmentType fulfillmentType,
        String provider,
        int payloadSchemaVersion,
        FulfillmentInventoryStatus status,
        Map<String, String> publicMetadata,
        Instant expiresAt,
        Instant reservedUntil,
        Instant createdAt,
        Instant deliveredAt) {

    public FulfillmentInventoryResponse {
        publicMetadata = publicMetadata == null ? Map.of() : Map.copyOf(publicMetadata);
    }
}
