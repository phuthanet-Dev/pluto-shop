package com.plutoshop.api.payment;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.net.URI;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Component
public class InwcloudPaymentGatewayClient {

    private static final String QR_HOST = "api.qrserver.com";
    private static final Pattern TRANSACTION_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,119}");
    private static final Logger LOGGER = LoggerFactory.getLogger(InwcloudPaymentGatewayClient.class);

    private final RestClient restClient;
    private final String apiKey;
    private final String trueWalletAmountUnit;

    public InwcloudPaymentGatewayClient(RestClient restClient, String apiKey) {
        this(restClient, apiKey, "BAHT");
    }

    @Autowired
    public InwcloudPaymentGatewayClient(
            RestClient restClient,
            @Value("${payment.inwcloud.api-key:}") String apiKey,
            @Value("${payment.inwcloud.truewallet-amount-unit:}") String trueWalletAmountUnit) {
        this.restClient = restClient;
        this.apiKey = apiKey;
        this.trueWalletAmountUnit = trueWalletAmountUnit;
    }

    public GeneratedPayment generate(BigDecimal amount) {
        requireConfigured();
        if (amount == null || amount.signum() <= 0 || amount.scale() > 2) {
            throw new PaymentGatewayException("Payment amount is invalid");
        }
        try {
            Map<?, ?> root = post("/v1/promptpay/generate", Map.of("amount", amount));
            requireSuccess(root);
            Map<?, ?> data = requiredMap(root, "data");
            String transactionId = requiredText(data, "transactionId", 120);
            long amountMinor = amountMinorValue(data);
            URI qrUrl = requiredQrUrl(data);
            String payload = requiredText(data, "payload", 20_000);
            long expiresAt = numberValue(data, "expires_at");
            if (expiresAt <= 0) throw new PaymentGatewayException("Payment gateway response is incomplete");
            return new GeneratedPayment(transactionId, qrUrl, payload, amountMinor, Instant.ofEpochSecond(expiresAt));
        } catch (PaymentGatewayException exception) {
            LOGGER.warn("PromptPay generate failed reason={}", safeFailureReason(exception));
            throw exception;
        }
    }

    public RedeemedPayment redeem(String voucherLink) {
        requireConfigured();
        requireTrueWalletAmountUnit();
        if (voucherLink == null || voucherLink.isBlank() || voucherLink.length() > 2_000) {
            throw new PaymentGatewayException("TrueWallet voucher link is invalid");
        }
        try {
            Map<?, ?> root = postTrueWallet("/v1/truewallet/redeem", Map.of("voucher_link", voucherLink));
            if (!"success".equalsIgnoreCase(textValue(root, "status"))) {
                throw new TrueWalletRedeemUncertainException("TrueWallet provider returned an unconfirmed status");
            }
            Map<?, ?> data = requiredMap(root, "data");
            return new RedeemedPayment(trueWalletAmountMinorValue(data));
        } catch (TrueWalletRedeemRejectedException exception) {
            throw exception;
        } catch (TrueWalletRedeemUncertainException exception) {
            throw exception;
        } catch (PaymentGatewayException exception) {
            throw new TrueWalletRedeemUncertainException("TrueWallet provider response is invalid", exception);
        }
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
        if ("failed".equals(status)) return new CheckedPayment(ProviderPaymentStatus.FAILED, message);
        return new CheckedPayment(ProviderPaymentStatus.REVIEW, message);
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
        } catch (RestClientResponseException exception) {
            LOGGER.warn("PromptPay provider HTTP failure status={}", exception.getStatusCode().value());
            throw new PaymentGatewayException("Payment gateway request failed", exception);
        } catch (RestClientException exception) {
            LOGGER.warn("PromptPay provider client failure type={}", exception.getClass().getSimpleName());
            throw new PaymentGatewayException("Payment gateway request failed", exception);
        }
    }

    private Map<?, ?> postTrueWallet(String path, Object body) {
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
        } catch (RestClientResponseException exception) {
            LOGGER.warn("TrueWallet provider HTTP failure status={}", exception.getStatusCode().value());
            throw new TrueWalletRedeemUncertainException("TrueWallet provider request is uncertain", exception);
        } catch (RestClientException exception) {
            LOGGER.warn("TrueWallet provider client failure type={}", exception.getClass().getSimpleName());
            throw new TrueWalletRedeemUncertainException("TrueWallet provider request is uncertain", exception);
        }
    }

    private static String safeFailureReason(PaymentGatewayException exception) {
        if (exception.getCause() instanceof RestClientResponseException response) {
            return "provider-http-" + response.getStatusCode().value();
        }
        if (exception.getCause() != null) return exception.getCause().getClass().getSimpleName();
        return exception.getMessage() == null ? "unknown" : exception.getMessage();
    }

    void requireConfigured() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new PaymentConfigurationException("Payment gateway is not configured");
        }
    }

    void requireTrueWalletConfigured() {
        requireConfigured();
        requireTrueWalletAmountUnit();
    }

    private void requireTrueWalletAmountUnit() {
        if (!"BAHT".equalsIgnoreCase(trueWalletAmountUnit)) {
            throw new PaymentConfigurationException("TrueWallet amount unit must be explicitly configured as BAHT");
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

    private static long amountMinorValue(Map<?, ?> data) {
        Object rawValue = data.get("amount");
        String value = exactDecimalText(rawValue);
        if (value.isBlank() || value.length() > 64) {
            throw new PaymentGatewayException("Payment gateway response is incomplete");
        }
        try {
            BigDecimal amount = new BigDecimal(value);
            if (amount.signum() <= 0) throw new ArithmeticException("amount must be positive");
            return amount.movePointRight(2).longValueExact();
        } catch (NumberFormatException | ArithmeticException exception) {
            throw new PaymentGatewayException("Payment gateway amount is invalid", exception);
        }
    }

    private static String exactDecimalText(Object rawValue) {
        if (rawValue instanceof String string) return string.trim();
        if (rawValue instanceof BigDecimal decimal) return decimal.toPlainString();
        if (rawValue instanceof BigInteger
                || rawValue instanceof Byte
                || rawValue instanceof Short
                || rawValue instanceof Integer
                || rawValue instanceof Long) {
            return rawValue.toString();
        }
        if (rawValue instanceof Float || rawValue instanceof Double) {
            throw new PaymentGatewayException("Payment gateway amount is not an exact decimal");
        }
        return "";
    }

    private long trueWalletAmountMinorValue(Map<?, ?> data) {
        requireTrueWalletAmountUnit();
        return amountMinorValue(data);
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

    public record GeneratedPayment(String transactionId, URI qrUrl, String payload, long amountMinor, Instant expiresAt) {
    }

    public record CheckedPayment(ProviderPaymentStatus status, String message) {
    }

    public record RedeemedPayment(long amountMinor) {
    }
}
