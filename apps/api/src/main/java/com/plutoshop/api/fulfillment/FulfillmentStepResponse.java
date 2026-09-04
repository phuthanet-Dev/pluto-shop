package com.plutoshop.api.fulfillment;

public record FulfillmentStepResponse(
        long id,
        int stepOrder,
        FulfillmentAudience audience,
        String titleTh,
        String titleEn,
        String bodyTh,
        String bodyEn,
        String linkUrl,
        boolean enabled) {
}
