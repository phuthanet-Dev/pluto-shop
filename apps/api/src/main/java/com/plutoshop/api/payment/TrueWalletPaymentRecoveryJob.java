package com.plutoshop.api.payment;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class TrueWalletPaymentRecoveryJob {

    private final TrueWalletPaymentService service;

    public TrueWalletPaymentRecoveryJob(TrueWalletPaymentService service) {
        this.service = service;
    }

    @Scheduled(fixedDelayString = "${payment.inwcloud.truewallet-recovery-interval-ms:60000}")
    public void recoverStaleRedemptions() {
        service.sweepStaleRedemptions();
    }
}
