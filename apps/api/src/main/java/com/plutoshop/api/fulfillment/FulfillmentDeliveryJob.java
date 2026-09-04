package com.plutoshop.api.fulfillment;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Runs bounded, retryable instant fulfillment delivery after payment commits. */
@Component
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
        prefix = "fulfillment.delivery",
        name = "enabled",
        havingValue = "true")
public class FulfillmentDeliveryJob {

    private static final Logger LOGGER = LoggerFactory.getLogger(FulfillmentDeliveryJob.class);

    private final FulfillmentDeliveryService deliveryService;
    private final int batchSize;

    public FulfillmentDeliveryJob(
            FulfillmentDeliveryService deliveryService,
            @org.springframework.beans.factory.annotation.Value("${fulfillment.delivery.batch-size:20}") int batchSize) {
        if (batchSize < 1 || batchSize > 100) {
            throw new IllegalArgumentException("Fulfillment delivery batch size is invalid");
        }
        this.deliveryService = deliveryService;
        this.batchSize = batchSize;
    }

    @Scheduled(
            fixedDelayString = "${fulfillment.delivery.fixed-delay-ms:5000}",
            initialDelayString = "${fulfillment.delivery.initial-delay-ms:5000}")
    public void sweep() {
        try {
            deliveryService.processDue(batchSize);
        } catch (RuntimeException exception) {
            LOGGER.warn("Fulfillment delivery sweep failed exception_type={}",
                    exception.getClass().getSimpleName());
        }
    }
}
