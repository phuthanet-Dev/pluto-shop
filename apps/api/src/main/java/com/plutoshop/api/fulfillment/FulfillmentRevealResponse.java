package com.plutoshop.api.fulfillment;

import java.util.Map;

public record FulfillmentRevealResponse(
        long inventoryItemId,
        FulfillmentType fulfillmentType,
        String provider,
        Map<String, String> fields) {

    public FulfillmentRevealResponse {
        fields = fields == null ? Map.of() : Map.copyOf(fields);
    }

    @Override
    public String toString() {
        return "FulfillmentRevealResponse[inventoryItemId=" + inventoryItemId
                + ", fulfillmentType=" + fulfillmentType
                + ", provider=" + provider
                + ", fields=<redacted>]";
    }
}
