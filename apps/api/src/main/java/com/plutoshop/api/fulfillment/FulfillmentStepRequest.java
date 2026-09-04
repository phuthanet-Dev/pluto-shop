package com.plutoshop.api.fulfillment;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record FulfillmentStepRequest(
        @Positive int stepOrder,
        @NotNull FulfillmentAudience audience,
        @NotBlank @Size(max = 180) String titleTh,
        @NotBlank @Size(max = 180) String titleEn,
        @NotBlank @Size(max = 4000) String bodyTh,
        @NotBlank @Size(max = 4000) String bodyEn,
        @Size(max = 2048) String linkUrl,
        boolean enabled) {
}
