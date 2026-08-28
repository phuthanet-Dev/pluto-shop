package com.plutoshop.api.payment;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class PaymentGatewayConfig {

    @Bean
    RestClient inwcloudRestClient(
            @Value("${payment.inwcloud.api-base-url:https://api.inwcloud.shop}") String baseUrl) {
        URI uri = URI.create(baseUrl);
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null) {
            throw new IllegalArgumentException("Payment gateway base URL must use HTTPS without credentials");
        }
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        return RestClient.builder()
                .baseUrl(uri.toString().replaceAll("/$", ""))
                .requestFactory(requestFactory)
                .build();
    }
}
