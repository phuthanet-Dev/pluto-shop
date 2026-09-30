package com.plutoshop.api.payment;

public class TrueWalletRedeemRejectedException extends PaymentGatewayException {

    public TrueWalletRedeemRejectedException(String message) {
        super(message);
    }

    public TrueWalletRedeemRejectedException(String message, Throwable cause) {
        super(message, cause);
    }
}
