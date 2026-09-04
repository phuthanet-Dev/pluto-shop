package com.plutoshop.api.fulfillment;

import java.util.List;

public record FulfillmentInventoryListResponse(
        List<FulfillmentInventoryResponse> items,
        int total,
        int available) {

    public FulfillmentInventoryListResponse {
        items = items == null ? List.of() : List.copyOf(items);
    }
}
