package com.plutoshop.api.payment;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;

import org.junit.jupiter.api.Test;

class PromptPayAvailabilityTest {

    @Test
    void closesPromptPayDuringBangkokBlackoutWindow() {
        assertThat(PromptPayAvailability.isAvailableAt(Instant.parse("2026-08-29T16:29:00Z"))).isTrue();
        assertThat(PromptPayAvailability.isAvailableAt(Instant.parse("2026-08-29T16:30:00Z"))).isFalse();
        assertThat(PromptPayAvailability.isAvailableAt(Instant.parse("2026-08-29T18:29:00Z"))).isFalse();
        assertThat(PromptPayAvailability.isAvailableAt(Instant.parse("2026-08-29T18:30:00Z"))).isTrue();
    }
}
