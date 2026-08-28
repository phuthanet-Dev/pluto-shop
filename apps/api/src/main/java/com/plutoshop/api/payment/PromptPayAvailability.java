package com.plutoshop.api.payment;

import java.time.Instant;
import java.time.ZoneId;
import java.time.LocalTime;

public final class PromptPayAvailability {

    private static final ZoneId BANGKOK = ZoneId.of("Asia/Bangkok");
    private static final LocalTime CLOSES_AT = LocalTime.of(23, 30);
    private static final LocalTime OPENS_AT = LocalTime.of(1, 30);

    private PromptPayAvailability() {
    }

    public static boolean isAvailableAt(Instant instant) {
        LocalTime bangkokTime = instant.atZone(BANGKOK).toLocalTime();
        return bangkokTime.isBefore(CLOSES_AT) && !bangkokTime.isBefore(OPENS_AT);
    }
}
