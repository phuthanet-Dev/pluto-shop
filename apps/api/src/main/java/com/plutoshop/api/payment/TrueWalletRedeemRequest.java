package com.plutoshop.api.payment;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TrueWalletRedeemRequest(
        @JsonProperty("voucher_link")
        @NotBlank
        @Size(max = 2_000)
        String voucherLink) {
}
