package com.plutoshop.api.payment;

import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.http.converter.json.JacksonJsonHttpMessageConverter;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
public class PaymentGatewayConfig {

    private static final String INWCLOUD_HOST = "api.inwcloud.shop";

    @Bean
    RestClient inwcloudRestClient(
            @Value("${payment.inwcloud.api-base-url:https://api.inwcloud.shop}") String baseUrl) {
        URI uri = validateBaseUrl(baseUrl);
        HttpClient httpClient = newHttpClient();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofSeconds(10));
        JsonMapper exactDecimalMapper = JsonMapper.builder()
                .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                .build();
        return RestClient.builder()
                .baseUrl(uri.toString().replaceAll("/$", ""))
                .requestFactory(requestFactory)
                .messageConverters(converters -> {
                    converters.removeIf(JacksonJsonHttpMessageConverter.class::isInstance);
                    converters.add(new JacksonJsonHttpMessageConverter(exactDecimalMapper));
                })
                .build();
    }

    static HttpClient newHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    static URI validateBaseUrl(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalArgumentException("Payment gateway base URL is invalid");
        }
        final URI uri;
        try {
            uri = URI.create(baseUrl);
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Payment gateway base URL is invalid", exception);
        }
        String path = uri.getRawPath();
        if (!"https".equalsIgnoreCase(uri.getScheme())
                || !INWCLOUD_HOST.equalsIgnoreCase(uri.getHost())
                || uri.getUserInfo() != null
                || uri.getRawQuery() != null
                || uri.getRawFragment() != null
                || (path != null && !path.isEmpty() && !"/".equals(path))
                || (uri.getPort() != -1 && uri.getPort() != 443)) {
            throw new IllegalArgumentException("Payment gateway base URL must be the fixed Inwcloud HTTPS origin");
        }
        return uri;
    }
}
