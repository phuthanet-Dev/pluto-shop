package com.plutoshop.api.fulfillment;

import java.util.List;

public record CustomerFulfillmentResponse(
        long orderId,
        String orderStatus,
        List<CustomerFulfillmentLineResponse> lines) {

    public CustomerFulfillmentResponse {
        lines = lines == null ? List.of() : List.copyOf(lines);
    }
}
