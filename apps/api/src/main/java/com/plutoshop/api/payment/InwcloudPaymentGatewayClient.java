package com.plutoshop.api.payment;

import java.math.BigDecimal;
import java.net.URI;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class InwcloudPaymentGatewayClient {

    private static final String QR_HOST = "api.qrserver.com";
    private static final Pattern TRANSACTION_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,119}");

    private final RestClient restClient;
    private final String apiKey;

    public InwcloudPaymentGatewayClient(
            RestClient restClient,
            @Value("${payment.inwcloud.api-key:}") String apiKey) {
        this.restClient = restClient;
        this.apiKey = apiKey;
    }

    public GeneratedPayment generate(BigDecimal amount) {
        requireConfigured();
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2) {
            throw new PaymentGatewayException("Payment amount is invalid");
        }
        Map<?, ?> root = post("/v1/promptpay/generate", Map.of("amount", amount));
        requireSuccess(root);
        Map<?, ?> data = requiredMap(root, "data");
        String transactionId = requiredText(data, "transactionId", 120);
        URI qrUrl = requiredQrUrl(data);
        String payload = requiredText(data, "payload", 20_000);
        long expiresAt = numberValue(data, "expires_at");
        if (expiresAt <= 0) throw new PaymentGatewayException("Payment gateway response is incomplete");
        return new GeneratedPayment(transactionId, qrUrl, payload, Instant.ofEpochSecond(expiresAt));
    }

    public CheckedPayment check(String transactionId) {
        requireConfigured();
        if (transactionId == null || !TRANSACTION_ID.matcher(transactionId).matches()) {
            throw new PaymentGatewayException("Payment transaction is invalid");
        }
        Map<?, ?> root = post("/v1/promptpay/check", Map.of("transactionId", transactionId));
        String status = textValue(root, "status").toLowerCase(Locale.ROOT);
        String message = textValue(root, "message");
        if ("success".equals(status)) return new CheckedPayment(ProviderPaymentStatus.PAID, message);
        if ("pending".equals(status)) return new CheckedPayment(ProviderPaymentStatus.PENDING, message);
        if (!status.isBlank()) return new CheckedPayment(ProviderPaymentStatus.FAILED, message);
        throw new PaymentGatewayException("Payment gateway response is incomplete");
    }

    private Map<?, ?> post(String path, Object body) {
        try {
            Map<?, ?> response = restClient.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<Map<String, Object>>() {
                    });
            if (response == null) {
                throw new PaymentGatewayException("Payment gateway response is invalid");
            }
            return response;
        } catch (PaymentGatewayException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new PaymentGatewayException("Payment gateway request failed", exception);
        }
    }

    private void requireConfigured() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new PaymentConfigurationException("Payment gateway is not configured");
        }
    }

    private static void requireSuccess(Map<?, ?> root) {
        if (!"success".equalsIgnoreCase(textValue(root, "status"))) {
            throw new PaymentGatewayException("Payment gateway rejected the request");
        }
    }

    private static Map<?, ?> requiredMap(Map<?, ?> parent, String field) {
        Object value = parent.get(field);
        if (!(value instanceof Map<?, ?> map)) {
            throw new PaymentGatewayException("Payment gateway response is incomplete");
        }
        return map;
    }

    private static String requiredText(Map<?, ?> parent, String field, int maxLength) {
        String value = textValue(parent, field);
        if (value.isBlank() || value.length() > maxLength) {
            throw new PaymentGatewayException("Payment gateway response is incomplete");
        }
        return value;
    }

    private static String textValue(Map<?, ?> parent, String field) {
        Object value = parent.get(field);
        return value instanceof String string ? string : "";
    }

    private static long numberValue(Map<?, ?> parent, String field) {
        Object value = parent.get(field);
        if (value instanceof Number number) return number.longValue();
        if (value instanceof String string) {
            try {
                return Long.parseLong(string);
            } catch (NumberFormatException ignored) {
                return 0;
            }
        }
        return 0;
    }

    private static URI requiredQrUrl(Map<?, ?> data) {
        String value = requiredText(data, "qr_url", 2_000);
        try {
            URI uri = URI.create(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || !QR_HOST.equalsIgnoreCase(uri.getHost())) {
                throw new PaymentGatewayException("Payment gateway QR URL is not allowed");
            }
            return uri;
        } catch (IllegalArgumentException exception) {
            throw new PaymentGatewayException("Payment gateway QR URL is invalid", exception);
        }
    }

    public record GeneratedPayment(String transactionId, URI qrUrl, String payload, Instant expiresAt) {
    }

    public record CheckedPayment(ProviderPaymentStatus status, String message) {
    }
}
