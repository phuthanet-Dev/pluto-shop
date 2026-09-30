package com.plutoshop.api.payment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class TrueWalletVoucherLinkTest {

    @Test
    void canonicalizesEquivalentVoucherUrlFormsBeforeFingerprinting() {
        assertThat(TrueWalletVoucherLink.validate(
                "HTTPS://GIFT.TRUEMONEY.COM/campaign/?v=synthetic%2Dvoucher"))
                .isEqualTo("https://gift.truemoney.com/campaign/?v=synthetic-voucher");
    }

    @Test
    void rejectsAdditionalQueryParametersThatCouldCreateDifferentFingerprints() {
        assertThatThrownBy(() -> TrueWalletVoucherLink.validate(
                "https://gift.truemoney.com/campaign/?v=synthetic-voucher&ref=synthetic"))
                .isInstanceOf(com.plutoshop.api.error.InvalidRequestParameterException.class);
    }
}
