package com.plutoshop.api.payment;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Base64;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

import static org.mockito.Mockito.mock;

@SpringBootTest
@AutoConfigureMockMvc
@Import(TrueWalletPaymentApiIntegrationTest.TestGatewayConfiguration.class)
@Testcontainers
class TrueWalletPaymentApiIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @org.junit.jupiter.api.io.TempDir
    static java.nio.file.Path IMAGE_ROOT;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry registry) {
        registry.add("product-media.root", () -> IMAGE_ROOT.toString());
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.datasource.hikari.read-only", () -> false);
        registry.add("spring.flyway.enabled", () -> true);
        registry.add("spring.flyway.url", POSTGRES::getJdbcUrl);
        registry.add("spring.flyway.user", POSTGRES::getUsername);
        registry.add("spring.flyway.password", POSTGRES::getPassword);
        registry.add("payment.inwcloud.api-key", () -> "test-api-key");
        registry.add("payment.inwcloud.truewallet-enabled", () -> true);
        registry.add("payment.inwcloud.truewallet-amount-unit", () -> "BAHT");
        registry.add("payment.inwcloud.truewallet-fingerprint-key-base64", () ->
                Base64.getUrlEncoder().withoutPadding().encodeToString("truewallet-test-key-32-bytes-123456".getBytes()));
        registry.add("payment.inwcloud.promptpay-blackout-enforced", () -> false);
        registry.add("payment.inwcloud.expiry-sweep-enabled", () -> false);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private InwcloudPaymentGatewayClient gateway;

    @Autowired
    private TrueWalletPaymentService trueWalletPaymentService;

    @TestConfiguration(proxyBeanMethods = false)
    static class TestGatewayConfiguration {

        @Bean
        @Primary
        InwcloudPaymentGatewayClient gateway() {
            return mock(InwcloudPaymentGatewayClient.class);
        }
    }

    @AfterEach
    void cleanPaymentFixtures() {
        jdbcTemplate.update("DELETE FROM payment_transactions");
        jdbcTemplate.update("DELETE FROM shop_order_items");
        jdbcTemplate.update("DELETE FROM shop_orders");
        jdbcTemplate.update("DELETE FROM cart_items");
        jdbcTemplate.update("DELETE FROM carts");
        jdbcTemplate.update("DELETE FROM app_users WHERE subject LIKE 'truewallet-test-%'");
        jdbcTemplate.update("UPDATE products SET stock_quantity = 88 WHERE id = 2");
        reset(gateway);
    }

    @Test
    void redeemsTrueWalletVoucherAndMarksOrderPaidWithoutReturningVoucher() throws Exception {
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-voucher";
        when(gateway.redeem(eq(voucherLink)))
                .thenReturn(new InwcloudPaymentGatewayClient.RedeemedPayment(119000L));
        addToCart("truewallet-test-paid", 1);

        String response = mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-paid"))
                        .header("Idempotency-Key", "truewallet-test-paid-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + voucherLink + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amountMinor").value(119000))
                .andExpect(jsonPath("$.providerAmountMinor").value(119000))
                .andExpect(jsonPath("$.status").value("PAID"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        org.junit.jupiter.api.Assertions.assertFalse(response.contains("voucher_link"));
        org.junit.jupiter.api.Assertions.assertEquals(
                "PAID",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM shop_orders WHERE idempotency_key = ?",
                        String.class,
                        "truewallet-test-paid-key"));
        org.junit.jupiter.api.Assertions.assertEquals(
                "PAID",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE provider = 'INWCLOUD_TRUEWALLET'",
                        String.class));
        org.junit.jupiter.api.Assertions.assertEquals(
                119000L,
                jdbcTemplate.queryForObject(
                        "SELECT provider_amount_minor FROM payment_transactions WHERE provider = 'INWCLOUD_TRUEWALLET'",
                        Long.class));
        org.junit.jupiter.api.Assertions.assertEquals(
                87,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
        mockMvc.perform(get("/api/v1/cart").with(customer("truewallet-test-paid")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
        verify(gateway, times(1)).redeem(eq(voucherLink));
    }

    @Test
    void anonymousCannotRedeemTrueWalletVoucher() throws Exception {
        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .header("Idempotency-Key", "truewallet-anonymous-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"https://gift.truemoney.com/campaign/?v=synthetic\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void amountMismatchMovesPaymentToReviewAndRetainsReservedStock() throws Exception {
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-mismatch";
        when(gateway.redeem(eq(voucherLink)))
                .thenReturn(new InwcloudPaymentGatewayClient.RedeemedPayment(1000L));
        addToCart("truewallet-test-mismatch", 1);

        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-mismatch"))
                        .header("Idempotency-Key", "truewallet-mismatch-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + voucherLink + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW"))
                .andExpect(jsonPath("$.providerAmountMinor").value(1000));

        org.junit.jupiter.api.Assertions.assertEquals(
                "PAYMENT_REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM shop_orders WHERE idempotency_key = ?",
                        String.class,
                        "truewallet-mismatch-key"));
        org.junit.jupiter.api.Assertions.assertEquals(
                87,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
    }

    @Test
    void definitiveProviderRejectionFailsPaymentAndReleasesReservedStock() throws Exception {
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-rejected";
        doThrow(new TrueWalletRedeemRejectedException("synthetic rejection"))
                .when(gateway).redeem(eq(voucherLink));
        addToCart("truewallet-test-rejected", 1);

        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-rejected"))
                        .header("Idempotency-Key", "truewallet-rejected-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + voucherLink + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FAILED"));

        org.junit.jupiter.api.Assertions.assertEquals(
                88,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
    }

    @Test
    void uncertainProviderResultMovesPaymentToReviewWithoutReleasingStock() throws Exception {
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-uncertain";
        doThrow(new TrueWalletRedeemUncertainException("synthetic timeout"))
                .when(gateway).redeem(eq(voucherLink));
        addToCart("truewallet-test-uncertain", 1);

        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-uncertain"))
                        .header("Idempotency-Key", "truewallet-uncertain-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + voucherLink + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW"));

        org.junit.jupiter.api.Assertions.assertEquals(
                87,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
        org.junit.jupiter.api.Assertions.assertEquals(
                "REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE provider = 'INWCLOUD_TRUEWALLET'",
                        String.class));
    }

    @Test
    void invalidVoucherLinkIsRejectedBeforeCreatingAnOrder() throws Exception {
        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-invalid"))
                        .header("Idempotency-Key", "truewallet-invalid-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"https://evil.example/voucher?v=synthetic\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("TrueWallet voucher link is invalid"));
        org.junit.jupiter.api.Assertions.assertEquals(
                0,
                jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM payment_transactions WHERE provider = 'INWCLOUD_TRUEWALLET'",
                        Integer.class));
    }

    @Test
    void idempotencyKeyCannotBeReusedWithAnotherVoucher() throws Exception {
        String firstVoucher = "https://gift.truemoney.com/campaign/?v=synthetic-first";
        String secondVoucher = "https://gift.truemoney.com/campaign/?v=synthetic-second";
        when(gateway.redeem(eq(firstVoucher)))
                .thenReturn(new InwcloudPaymentGatewayClient.RedeemedPayment(119000L));
        addToCart("truewallet-test-idempotency", 1);

        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-idempotency"))
                        .header("Idempotency-Key", "truewallet-idempotency-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + firstVoucher + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mockMvc.perform(post("/api/v1/checkout/truewallet")
                        .with(customer("truewallet-test-idempotency"))
                        .header("Idempotency-Key", "truewallet-idempotency-key")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"voucher_link\":\"" + secondVoucher + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Idempotency key was already used with different payment details"));

        verify(gateway, times(1)).redeem(eq(firstVoucher));
    }

    @Test
    void staleRedemptionMovesPaymentAndOrderToReviewTogether() throws Exception {
        seedStaleTrueWalletPayment("truewallet-test-stale", "truewallet-stale-key", "PAYMENT_PENDING");

        org.junit.jupiter.api.Assertions.assertEquals(1, trueWalletPaymentService.sweepStaleRedemptions());
        org.junit.jupiter.api.Assertions.assertEquals(
                "REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                        String.class,
                        "truewallet-stale-transaction"));
        org.junit.jupiter.api.Assertions.assertEquals(
                "PAYMENT_REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM shop_orders WHERE idempotency_key = ?",
                        String.class,
                        "truewallet-stale-key"));
    }

    @Test
    void staleRedemptionRollsBackWhenItsOrderCannotEnterReview() throws Exception {
        seedStaleTrueWalletPayment("truewallet-test-stale-rollback", "truewallet-stale-rollback-key", "PAID");

        assertThrows(PaymentGatewayException.class, () -> trueWalletPaymentService.sweepStaleRedemptions());
        org.junit.jupiter.api.Assertions.assertEquals(
                "PENDING",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                        String.class,
                        "truewallet-stale-transaction"));
    }

    @Test
    void stalePreparedPaymentWithoutClaimTimestampIsRecovered() throws Exception {
        addToCart("truewallet-test-prepared-stale", 1);
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM app_users WHERE subject = ?", Long.class, "truewallet-test-prepared-stale");
        Long orderId = jdbcTemplate.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (?, 'PAYMENT_PENDING', 'TRUEWALLET', 'THB', 119000, 'truewallet-prepared-stale-key')
                RETURNING id
                """, Long.class, userId);
        jdbcTemplate.update("""
                INSERT INTO payment_transactions
                    (order_id, provider, transaction_id, status, amount_minor, voucher_fingerprint)
                VALUES (?, 'INWCLOUD_TRUEWALLET', 'truewallet-prepared-stale-transaction', 'PENDING', 119000,
                        decode(repeat('cd', 32), 'hex'))
                """, orderId);
        jdbcTemplate.update("""
                UPDATE payment_transactions
                SET created_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
                WHERE transaction_id = 'truewallet-prepared-stale-transaction'
                """);

        org.junit.jupiter.api.Assertions.assertEquals(1, trueWalletPaymentService.sweepStaleRedemptions());
        org.junit.jupiter.api.Assertions.assertEquals(
                "REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                        String.class,
                        "truewallet-prepared-stale-transaction"));
        org.junit.jupiter.api.Assertions.assertEquals(
                "PAYMENT_REVIEW",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM shop_orders WHERE idempotency_key = ?",
                        String.class,
                        "truewallet-prepared-stale-key"));
    }

    private void addToCart(String subject, int quantity) throws Exception {
        mockMvc.perform(post("/api/v1/cart/merge")
                        .with(customer(subject))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":" + quantity + "}]}"))
                .andExpect(status().isOk());
    }

    private void seedStaleTrueWalletPayment(String subject, String idempotencyKey, String orderStatus) throws Exception {
        addToCart(subject, 1);
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM app_users WHERE subject = ?", Long.class, subject);
        Long orderId = jdbcTemplate.queryForObject("""
                INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                VALUES (?, ?, 'TRUEWALLET', 'THB', 119000, ?)
                RETURNING id
                """, Long.class, userId, orderStatus, idempotencyKey);
        jdbcTemplate.update("""
                INSERT INTO payment_transactions
                    (order_id, provider, transaction_id, status, amount_minor, voucher_fingerprint, redeem_started_at)
                VALUES (?, 'INWCLOUD_TRUEWALLET', 'truewallet-stale-transaction', 'PENDING', 119000,
                        decode(repeat('ab', 32), 'hex'), CURRENT_TIMESTAMP - INTERVAL '1 hour')
                """, orderId);
    }

    private static org.springframework.test.web.servlet.request.RequestPostProcessor customer(String subject) {
        return jwt().jwt(jwt -> jwt
                .issuer("http://127.0.0.1:8081/realms/pluto")
                .subject(subject)
                .claim("email", subject + "@example.invalid")
                .claim("name", subject))
                .authorities(new SimpleGrantedAuthority("ROLE_CUSTOMER"));
    }
}
