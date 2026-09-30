package com.plutoshop.api.payment;

public class TrueWalletRedeemUncertainException extends PaymentGatewayException {

    public TrueWalletRedeemUncertainException(String message) {
        super(message);
    }

    public TrueWalletRedeemUncertainException(String message, Throwable cause) {
        super(message, cause);
    }
}
