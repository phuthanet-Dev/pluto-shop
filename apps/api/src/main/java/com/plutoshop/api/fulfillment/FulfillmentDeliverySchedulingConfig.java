package com.plutoshop.api.fulfillment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
        prefix = "fulfillment.delivery",
        name = "enabled",
        havingValue = "true")
class FulfillmentDeliverySchedulingConfig {
}
