package com.plutoshop.api.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@ConditionalOnProperty(
        prefix = "payment.inwcloud",
        name = "expiry-sweep-enabled",
        havingValue = "true",
        matchIfMissing = true)
public class PromptPayPaymentSchedulingConfig {
}
