package com.plutoshop.api.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.http.HttpClient;
import org.junit.jupiter.api.Test;

class PaymentGatewayConfigTest {

    @Test
    void rejectsProviderBaseUrlOutsideTheDocumentedInwcloudOrigin() {
        PaymentGatewayConfig config = new PaymentGatewayConfig();

        assertThatThrownBy(() -> config.inwcloudRestClient("https://evil.example"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Payment gateway base URL must be the fixed Inwcloud HTTPS origin");
    }

    @Test
    void disablesRedirectsForCredentialBearingRequests() {
        assertThat(PaymentGatewayConfig.newHttpClient().followRedirects())
                .isEqualTo(HttpClient.Redirect.NEVER);
    }
}
