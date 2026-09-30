package com.plutoshop.api.payment;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * Serializes checkout preparation for one authenticated user across payment methods.
 * The lock is transaction-scoped and therefore releases automatically on commit/rollback.
 */
public final class PaymentCheckoutLock {

    private PaymentCheckoutLock() {
    }

    public static void acquire(NamedParameterJdbcTemplate jdbc, long userId) {
        jdbc.query("""
                SELECT pg_advisory_xact_lock(hashtextextended(:lockKey, 0))
                """, new MapSqlParameterSource("lockKey", "pluto-shop:checkout:user:" + userId),
                (rs, rowNum) -> null);
    }
}
