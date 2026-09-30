package com.plutoshop.api.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withBadRequest;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class InwcloudPaymentGatewayClientTest {

    @Test
    void generatesPromptPayQrWithBearerAuthAndParsesProviderResponse() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        server.expect(requestTo("https://api.inwcloud.shop/v1/promptpay/generate"))
                .andExpect(header("Authorization", "Bearer test-api-key"))
                .andExpect(jsonPath("$.amount").value(123.45))
                .andRespond(withSuccess("""
                        {
                          "status":"success",
                          "data":{
                            "transactionId":"Market-test-123",
                            "qr_url":"https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
                            "payload":"000201010212",
                            "amount":"123.45",
                            "expires_at":1893456000
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        InwcloudPaymentGatewayClient.GeneratedPayment payment = client.generate(new BigDecimal("123.45"));

        assertThat(payment.transactionId()).isEqualTo("Market-test-123");
        assertThat(payment.amountMinor()).isEqualTo(12345L);
        assertThat(payment.qrUrl().toString()).startsWith("https://api.qrserver.com/");
        assertThat(payment.payload()).isEqualTo("000201010212");
        assertThat(payment.expiresAt().getEpochSecond()).isEqualTo(1893456000L);
        server.verify();
    }

    @Test
    void parsesDecimalProviderAmountAsExactText() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        server.expect(requestTo("https://api.inwcloud.shop/v1/promptpay/generate"))
                .andRespond(withSuccess("""
                        {
                          "status":"success",
                          "data":{
                            "transactionId":"Market-test-number",
                            "qr_url":"https://api.qrserver.com/v1/create-qr-code/?data=promptpay",
                            "payload":"000201010212",
                            "amount":"123.45",
                            "expires_at":1893456000
                          }
                        }
                        """, MediaType.APPLICATION_JSON));

        InwcloudPaymentGatewayClient.GeneratedPayment payment = client.generate(new BigDecimal("123.45"));

        assertThat(payment.amountMinor()).isEqualTo(12345L);
        server.verify();
    }

    @Test
    void redeemsTrueWalletVoucherWithExactDocumentedContractAndDoesNotReturnVoucher() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-voucher";

        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andExpect(header("Authorization", "Bearer test-api-key"))
                .andExpect(jsonPath("$.voucher_link").value(voucherLink))
                .andRespond(withSuccess("""
                        {
                          "status":"success",
                          "message":"เติมเงินสำเร็จ",
                          "data":{
                            "amount":10,
                            "voucher_link":"https://gift.truemoney.com/campaign/?v=provider-echo"
                          },
                          "rate_limit":{"limit":50,"remaining":49,"tier":"free"},
                          "billing":{"cost":0,"customer_type":"existing"}
                        }
                        """, MediaType.APPLICATION_JSON));

        InwcloudPaymentGatewayClient.RedeemedPayment payment = client.redeem(voucherLink);

        assertThat(payment.amountMinor()).isEqualTo(1000L);
        assertThat(payment.toString()).doesNotContain("voucher");
        server.verify();
    }

    @Test
    void classifiesProviderClientErrorAsUncertainVoucherOutcome() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-rejected";
        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andRespond(withBadRequest());

        assertThatThrownBy(() -> client.redeem(voucherLink))
                .isInstanceOf(TrueWalletRedeemUncertainException.class);
        server.verify();
    }

    @Test
    void classifiesProviderTimeoutAsUncertainVoucherOutcome() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-timeout";
        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andRespond(withStatus(HttpStatus.REQUEST_TIMEOUT));

        assertThatThrownBy(() -> client.redeem(voucherLink))
                .isInstanceOf(TrueWalletRedeemUncertainException.class);
        server.verify();
    }

    @Test
    void classifiesNonSuccessTwoHundredResponseAsUncertainVoucherOutcome() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-pending";
        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andRespond(withSuccess("{\"status\":\"pending\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.redeem(voucherLink))
                .isInstanceOf(TrueWalletRedeemUncertainException.class);
        server.verify();
    }

    @Test
    void classifiesProviderServerErrorAsUncertain() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-uncertain";
        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.redeem(voucherLink))
                .isInstanceOf(TrueWalletRedeemUncertainException.class);
        server.verify();
    }

    @Test
    void rejectsFloatingPointTrueWalletAmountAsUncertain() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        String voucherLink = "https://gift.truemoney.com/campaign/?v=synthetic-float";
        server.expect(requestTo("https://api.inwcloud.shop/v1/truewallet/redeem"))
                .andRespond(withSuccess("""
                        {"status":"success","data":{"amount":10.10}}
                        """, MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.redeem(voucherLink))
                .isInstanceOf(TrueWalletRedeemUncertainException.class);
        server.verify();
    }

    @Test
    void mapsUnknownPromptPayStatusToReview() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.inwcloud.shop");
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        InwcloudPaymentGatewayClient client = new InwcloudPaymentGatewayClient(builder.build(), "test-api-key");
        server.expect(requestTo("https://api.inwcloud.shop/v1/promptpay/check"))
                .andRespond(withSuccess("{\"status\":\"temporarily_unavailable\"}", MediaType.APPLICATION_JSON));

        assertThat(client.check("promptpay-unknown-status").status()).isEqualTo(ProviderPaymentStatus.REVIEW);
        server.verify();
    }
}
