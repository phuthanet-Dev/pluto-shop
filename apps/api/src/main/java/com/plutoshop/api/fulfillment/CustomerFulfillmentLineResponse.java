package com.plutoshop.api.fulfillment;

import java.util.List;

public record CustomerFulfillmentLineResponse(
        long orderItemId,
        long productId,
        FulfillmentType fulfillmentType,
        String deliveryType,
        OrderFulfillmentStatus status,
        boolean revealAvailable,
        List<FulfillmentStepResponse> customerSteps) {

    public CustomerFulfillmentLineResponse {
        customerSteps = customerSteps == null ? List.of() : List.copyOf(customerSteps);
    }
}
