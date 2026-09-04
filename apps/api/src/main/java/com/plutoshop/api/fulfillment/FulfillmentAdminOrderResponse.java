package com.plutoshop.api.fulfillment;

public record FulfillmentAdminOrderResponse(
        long fulfillmentId,
        long orderItemId,
        long productId,
        FulfillmentType fulfillmentType,
        String deliveryType,
        OrderFulfillmentStatus status) {
}
