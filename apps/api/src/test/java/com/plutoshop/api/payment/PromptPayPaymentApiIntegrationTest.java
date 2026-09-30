package com.plutoshop.api.payment;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.net.URI;
import java.time.Instant;

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
import static org.mockito.Mockito.reset;

@SpringBootTest
@AutoConfigureMockMvc
@Import(PromptPayPaymentApiIntegrationTest.TestGatewayConfiguration.class)
@Testcontainers
class PromptPayPaymentApiIntegrationTest {

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
    private PromptPayPaymentService paymentService;

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
        jdbcTemplate.update("DELETE FROM app_users WHERE subject LIKE 'payment-test-%'");
        jdbcTemplate.update("UPDATE products SET stock_quantity = 88 WHERE id = 2");
        reset(gateway);
    }

    @Test
    void anonymousCannotStartOrCheckPayment() throws Exception {
        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .header("Idempotency-Key", "payment-test-anonymous-1"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-1/check"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-1/cancel"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void checkoutUsesServerCartPricesAndIdempotency() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-create", 238000));
        addToCart("payment-test-create", 2);

        String response = mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-create"))
                        .header("Idempotency-Key", "payment-test-idempotency-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionId").value("Market-test-create"))
                .andExpect(jsonPath("$.amountMinor").value(238000))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        Integer storedOrders = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM shop_orders WHERE idempotency_key = ?",
                Integer.class,
                "payment-test-idempotency-1");
        Integer storedPayments = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_transactions WHERE transaction_id = ?",
                Integer.class,
                "Market-test-create");
        org.junit.jupiter.api.Assertions.assertEquals(1, storedOrders);
        org.junit.jupiter.api.Assertions.assertEquals(1, storedPayments);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-create"))
                        .header("Idempotency-Key", "payment-test-idempotency-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionId").value("Market-test-create"))
                .andExpect(jsonPath("$.orderId").value(org.hamcrest.Matchers.notNullValue()));

        verify(gateway, times(1)).generate(any());
        org.junit.jupiter.api.Assertions.assertNotNull(response);
        Integer remainingStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(86, remainingStock);
    }

    @Test
    void acceptsProviderRandomSatangAddedToServerOrderTotal() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-random-satang", 119053));
        addToCart("payment-test-random-satang", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-random-satang"))
                        .header("Idempotency-Key", "payment-test-random-satang-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.transactionId").value("Market-test-random-satang"))
                .andExpect(jsonPath("$.amountMinor").value(119053))
                .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void rejectsProviderAmountThatDoesNotMatchServerOrderTotal() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-amount-mismatch", 1098));
        addToCart("payment-test-amount-mismatch", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-amount-mismatch"))
                        .header("Idempotency-Key", "payment-test-amount-mismatch-key"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("Payment amount does not match order total"));

        Integer orders = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM shop_orders WHERE idempotency_key = ?",
                Integer.class,
                "payment-test-amount-mismatch-key");
        Integer payments = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_transactions WHERE transaction_id = ?",
                Integer.class,
                "Market-test-amount-mismatch");
        Integer remainingStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(0, orders);
        org.junit.jupiter.api.Assertions.assertEquals(0, payments);
        org.junit.jupiter.api.Assertions.assertEquals(88, remainingStock);
    }

    @Test
    void rejectsProviderRandomSatangOutsideAllowedRange() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-random-satang-too-large", 119100));
        addToCart("payment-test-random-satang-too-large", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-random-satang-too-large"))
                        .header("Idempotency-Key", "payment-test-random-satang-too-large-key"))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.detail").value("Payment amount does not match order total"));

        Integer orders = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM shop_orders WHERE idempotency_key = ?",
                Integer.class,
                "payment-test-random-satang-too-large-key");
        Integer payments = jdbcTemplate.queryForObject(
                "SELECT count(*) FROM payment_transactions WHERE transaction_id = ?",
                Integer.class,
                "Market-test-random-satang-too-large");
        Integer remainingStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(0, orders);
        org.junit.jupiter.api.Assertions.assertEquals(0, payments);
        org.junit.jupiter.api.Assertions.assertEquals(88, remainingStock);
    }

    @Test
    void pendingPaymentLocksCartUntilPaymentCompletes() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-paid", 238000));
        when(gateway.check("Market-test-paid"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.PENDING, ""))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.PAID, ""));
        addToCart("payment-test-paid", 2);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-paid"))
                        .header("Idempotency-Key", "payment-test-paid-key"))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/v1/cart")
                        .with(customer("payment-test-paid"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":3}]}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Cart is locked while a payment is pending or under review"));

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-paid/check")
                        .with(customer("payment-test-paid")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-paid/check")
                        .with(customer("payment-test-paid")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mockMvc.perform(get("/api/v1/cart").with(customer("payment-test-paid")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(0)));
        String orderStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM shop_orders WHERE id = (SELECT order_id FROM payment_transactions WHERE transaction_id = ?)",
                String.class,
                "Market-test-paid");
        org.junit.jupiter.api.Assertions.assertEquals("PAID", orderStatus);
    }

    @Test
    void ownerCancellationRequiresProviderReconciliationAndRetainsReservation() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-cancel", 119000));
        addToCart("payment-test-cancel", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-cancel"))
                        .header("Idempotency-Key", "payment-test-cancel-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING"));

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-cancel/cancel")
                        .with(customer("payment-test-cancel")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW"))
                .andExpect(jsonPath("$.message").value("Cancellation requires provider reconciliation"));

        when(gateway.check("Market-test-cancel"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.PENDING, ""));

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-cancel/check")
                        .with(customer("payment-test-cancel")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW"));
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-cancel/cancel")
                        .with(customer("payment-test-cancel")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Payment cannot be cancelled"));
        mockMvc.perform(put("/api/v1/cart")
                        .with(customer("payment-test-cancel"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":2}]}"))
                .andExpect(status().isConflict());
        mockMvc.perform(get("/api/v1/cart").with(customer("payment-test-cancel")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].quantity").value(1));

        String paymentStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                String.class,
                "Market-test-cancel");
        String orderStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM shop_orders WHERE id = (SELECT order_id FROM payment_transactions WHERE transaction_id = ?)",
                String.class,
                "Market-test-cancel");
        Integer restoredStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals("REVIEW", paymentStatus);
        org.junit.jupiter.api.Assertions.assertEquals("PAYMENT_REVIEW", orderStatus);
        org.junit.jupiter.api.Assertions.assertEquals(87, restoredStock);
        verify(gateway, times(1)).check("Market-test-cancel");
    }

    @Test
    void anotherUserCannotCancelSomeoneElsesPayment() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-owner-cancel", 119000));
        addToCart("payment-test-owner-cancel", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-owner-cancel"))
                        .header("Idempotency-Key", "payment-test-owner-cancel-key"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-owner-cancel/cancel")
                        .with(customer("payment-test-other-cancel")))
                .andExpect(status().isNotFound());
        verify(gateway, never()).check("Market-test-owner-cancel");
    }

    @Test
    void cannotCancelPaidPayment() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-paid-cancel", 119000));
        when(gateway.check("Market-test-paid-cancel"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.PAID, ""));
        addToCart("payment-test-paid-cancel", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-paid-cancel"))
                        .header("Idempotency-Key", "payment-test-paid-cancel-key"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-paid-cancel/check")
                        .with(customer("payment-test-paid-cancel")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-paid-cancel/cancel")
                        .with(customer("payment-test-paid-cancel")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Payment cannot be cancelled"));
    }

    @Test
    void expiredPaymentReleasesReservedStock() throws Exception {
        when(gateway.generate(any())).thenReturn(new InwcloudPaymentGatewayClient.GeneratedPayment(
                "Market-test-expired",
                URI.create("https://api.qrserver.com/v1/create-qr-code/?data=promptpay"),
                "000201010212",
                119000,
                Instant.now().minusSeconds(1)));
        when(gateway.check("Market-test-expired"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.FAILED, ""));
        addToCart("payment-test-expired", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-expired"))
                        .header("Idempotency-Key", "payment-test-expired-key"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-expired/check")
                        .with(customer("payment-test-expired")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EXPIRED"));

        Integer restoredStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals(88, restoredStock);
    }

    @Test
    void expiredPaymentUsesProviderPaidResultBeforeReleasingReservation() throws Exception {
        when(gateway.generate(any())).thenReturn(new InwcloudPaymentGatewayClient.GeneratedPayment(
                "Market-test-expired-paid",
                URI.create("https://api.qrserver.com/v1/create-qr-code/?data=promptpay"),
                "000201010212",
                119000,
                Instant.now().minusSeconds(1)));
        when(gateway.check("Market-test-expired-paid"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.PAID, ""));
        addToCart("payment-test-expired-paid", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-expired-paid"))
                        .header("Idempotency-Key", "payment-test-expired-paid-key"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-expired-paid/check")
                        .with(customer("payment-test-expired-paid")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));

        org.junit.jupiter.api.Assertions.assertEquals(
                87,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
    }

    @Test
    void providerCheckFailureMovesPendingPaymentToReviewWithoutReleasingStock() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-check-review", 119000));
        when(gateway.check("Market-test-check-review"))
                .thenThrow(new PaymentGatewayException("provider check failed"));
        addToCart("payment-test-check-review", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-check-review"))
                        .header("Idempotency-Key", "payment-test-check-review-key"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-check-review/check")
                        .with(customer("payment-test-check-review")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REVIEW"));

        org.junit.jupiter.api.Assertions.assertEquals(
                87,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
    }

    @Test
    void expirySweepUsesProviderStatusBeforeReleasingReservation() throws Exception {
        when(gateway.generate(any())).thenReturn(new InwcloudPaymentGatewayClient.GeneratedPayment(
                "Market-test-sweep",
                URI.create("https://api.qrserver.com/v1/create-qr-code/?data=promptpay"),
                "000201010212",
                119000,
                Instant.now().minusSeconds(1)));
        when(gateway.check("Market-test-sweep"))
                .thenReturn(new InwcloudPaymentGatewayClient.CheckedPayment(ProviderPaymentStatus.FAILED, ""));
        addToCart("payment-test-sweep", 1);

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-sweep"))
                        .header("Idempotency-Key", "payment-test-sweep-key"))
                .andExpect(status().isOk());

        paymentService.sweepExpiredPayments();

        String paymentStatus = jdbcTemplate.queryForObject(
                "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                String.class,
                "Market-test-sweep");
        Integer restoredStock = jdbcTemplate.queryForObject(
                "SELECT stock_quantity FROM products WHERE id = 2", Integer.class);
        org.junit.jupiter.api.Assertions.assertEquals("EXPIRED", paymentStatus);
        org.junit.jupiter.api.Assertions.assertEquals(88, restoredStock);
    }

    @Test
    void anotherUserCannotCheckSomeoneElsesTransaction() throws Exception {
        when(gateway.generate(any())).thenReturn(generatedPayment("Market-test-owner", 119000));
        addToCart("payment-test-owner", 1);
        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-owner"))
                        .header("Idempotency-Key", "payment-test-owner-key"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/v1/payments/promptpay/Market-test-owner/check")
                        .with(customer("payment-test-other")))
                .andExpect(status().isNotFound());
        verify(gateway, never()).check("Market-test-owner");
    }

    @Test
    void promptPayEndpointsCannotInspectOrCancelTrueWalletTransactions() throws Exception {
        addPendingTrueWalletPayment(
                "payment-test-cross-provider",
                "TrueWallet-test-cross-provider",
                "payment-test-cross-provider-key");

        mockMvc.perform(post("/api/v1/payments/promptpay/TrueWallet-test-cross-provider/check")
                        .with(customer("payment-test-cross-provider")))
                .andExpect(status().isNotFound());
        mockMvc.perform(post("/api/v1/payments/promptpay/TrueWallet-test-cross-provider/cancel")
                        .with(customer("payment-test-cross-provider")))
                .andExpect(status().isNotFound());

        verify(gateway, never()).check("TrueWallet-test-cross-provider");
        org.junit.jupiter.api.Assertions.assertEquals(
                "PENDING",
                jdbcTemplate.queryForObject(
                        "SELECT status FROM payment_transactions WHERE transaction_id = ?",
                        String.class,
                        "TrueWallet-test-cross-provider"));
    }

    @Test
    void promptPayCannotStartWhileAnotherProviderPaymentIsActive() throws Exception {
        addPendingTrueWalletPayment(
                "payment-test-active-provider",
                "TrueWallet-test-active-provider",
                "truewallet-test-active-provider-key");

        mockMvc.perform(post("/api/v1/checkout/promptpay")
                        .with(customer("payment-test-active-provider"))
                        .header("Idempotency-Key", "promptpay-test-active-provider-key"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("Another payment is already pending or under review"));

        verify(gateway, never()).generate(any());
        org.junit.jupiter.api.Assertions.assertEquals(
                88,
                jdbcTemplate.queryForObject("SELECT stock_quantity FROM products WHERE id = 2", Integer.class));
    }

    @Test
    void activePaymentEndpointReturnsTrueWalletMetadataWithoutVoucherData() throws Exception {
        addPendingTrueWalletPayment(
                "payment-test-active-endpoint",
                "TrueWallet-test-active-endpoint",
                "truewallet-test-active-endpoint-key");

        mockMvc.perform(get("/api/v1/payments/active")
                        .with(customer("payment-test-active-endpoint")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.paymentMethod").value("TRUEWALLET"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.transactionId").value("TrueWallet-test-active-endpoint"))
                .andExpect(jsonPath("$.qrUrl").doesNotExist())
                .andExpect(jsonPath("$.payload").doesNotExist())
                .andExpect(jsonPath("$.voucher_link").doesNotExist())
                .andExpect(jsonPath("$.voucherFingerprint").doesNotExist());
    }

    @Test
    void cartReadsRetainReservedItemsAndCartWritesStayLocked() throws Exception {
        addPendingTrueWalletPayment(
                "payment-test-cart-lock",
                "TrueWallet-test-cart-lock",
                "truewallet-test-cart-lock-key");
        jdbcTemplate.update("UPDATE products SET stock_quantity = 0 WHERE id = 2");

        mockMvc.perform(get("/api/v1/cart").with(customer("payment-test-cart-lock")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].productId").value(2))
                .andExpect(jsonPath("$.removedProductIds", hasSize(0)));
        mockMvc.perform(put("/api/v1/cart")
                        .with(customer("payment-test-cart-lock"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":1}]}"))
                .andExpect(status().isConflict());
        mockMvc.perform(post("/api/v1/cart/merge")
                        .with(customer("payment-test-cart-lock"))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":1}]}"))
                .andExpect(status().isConflict());
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/cart")
                        .with(customer("payment-test-cart-lock")))
                .andExpect(status().isConflict());
    }

    private void addToCart(String subject, int quantity) throws Exception {
        mockMvc.perform(post("/api/v1/cart/merge")
                        .with(customer(subject))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"items\":[{\"productId\":2,\"quantity\":" + quantity + "}]}"))
                .andExpect(status().isOk());
    }

    private void addPendingTrueWalletPayment(String subject, String transactionId, String idempotencyKey)
            throws Exception {
        addToCart(subject, 1);
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM app_users WHERE subject = ?",
                Long.class,
                subject);
        Long orderId = jdbcTemplate.queryForObject(
                """
                        INSERT INTO shop_orders (user_id, status, payment_method, currency, total_minor, idempotency_key)
                        VALUES (?, 'PAYMENT_PENDING', 'TRUEWALLET', 'THB', 119000, ?)
                        RETURNING id
                        """,
                Long.class,
                userId,
                idempotencyKey);
        jdbcTemplate.update(
                """
                        INSERT INTO payment_transactions (
                            order_id, provider, transaction_id, status, amount_minor, voucher_fingerprint
                        ) VALUES (?, 'INWCLOUD_TRUEWALLET', ?, 'PENDING', 119000, decode(repeat('ab', 32), 'hex'))
                        """,
                orderId,
                transactionId);
    }

    private static InwcloudPaymentGatewayClient.GeneratedPayment generatedPayment(String transactionId, long amountMinor) {
        return new InwcloudPaymentGatewayClient.GeneratedPayment(
                transactionId,
                URI.create("https://api.qrserver.com/v1/create-qr-code/?data=promptpay"),
                "000201010212",
                amountMinor,
                Instant.now().plusSeconds(600));
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
