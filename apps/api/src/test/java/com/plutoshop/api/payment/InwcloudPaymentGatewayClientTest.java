package com.plutoshop.api.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;
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
        assertThat(payment.qrUrl().toString()).startsWith("https://api.qrserver.com/");
        assertThat(payment.payload()).isEqualTo("000201010212");
        assertThat(payment.expiresAt().getEpochSecond()).isEqualTo(1893456000L);
        server.verify();
    }
}
