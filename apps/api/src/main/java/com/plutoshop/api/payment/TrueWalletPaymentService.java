package com.plutoshop.api.payment;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.plutoshop.api.cart.Cart;
import com.plutoshop.api.cart.CartItem;
import com.plutoshop.api.cart.CartRepository;
import com.plutoshop.api.catalog.Product;
import com.plutoshop.api.catalog.ProductRepository;
import com.plutoshop.api.fulfillment.FulfillmentAllocationService;
import com.plutoshop.api.user.AppUser;
import com.plutoshop.api.user.AppUserRepository;

@Service
public class TrueWalletPaymentService {

    private static final String CURRENCY = "THB";
    private static final String PROVIDER = "INWCLOUD_TRUEWALLET";
    private static final String PAYMENT_METHOD = "TRUEWALLET";
    private static final String FINGERPRINT_CONTEXT = "pluto-shop:truewallet:v1\u0000";
    private static final long STALE_REDEEM_SECONDS = 10 * 60;
    private static final java.util.regex.Pattern IDEMPOTENCY_KEY =
            java.util.regex.Pattern.compile("[A-Za-z0-9._:-]{16,100}");
    private static final RowMapper<PaymentSnapshot> PAYMENT_ROW = TrueWalletPaymentService::mapPayment;
    private static final RowMapper<OrderLine> ORDER_LINE_ROW = (rs, rowNum) ->
            new OrderLine(rs.getLong("product_id"), rs.getInt("quantity"));

    private final AppUserRepository userRepository;
    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final NamedParameterJdbcTemplate jdbc;
    private final InwcloudPaymentGatewayClient gateway;
    private final FulfillmentAllocationService fulfillmentAllocationService;
    private final TransactionTemplate transactionTemplate;
    private final boolean enabled;
    private final String fingerprintKeyBase64;

    public TrueWalletPaymentService(
            AppUserRepository userRepository,
            CartRepository cartRepository,
            ProductRepository productRepository,
            @Qualifier("userJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            InwcloudPaymentGatewayClient gateway,
            FulfillmentAllocationService fulfillmentAllocationService,
            @Qualifier("transactionManager") PlatformTransactionManager transactionManager,
            @org.springframework.beans.factory.annotation.Value("${payment.inwcloud.truewallet-enabled:false}") boolean enabled,
            @org.springframework.beans.factory.annotation.Value("${payment.inwcloud.truewallet-fingerprint-key-base64:}") String fingerprintKeyBase64) {
        this.userRepository = userRepository;
        this.cartRepository = cartRepository;
        this.productRepository = productRepository;
        this.jdbc = jdbc;
        this.gateway = gateway;
        this.fulfillmentAllocationService = fulfillmentAllocationService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.enabled = enabled;
        this.fingerprintKeyBase64 = fingerprintKeyBase64;
    }

    public TrueWalletPaymentResponse redeemTrueWallet(Jwt jwt, String idempotencyKey, TrueWalletRedeemRequest request) {
        ensureEnabled();
        validateIdempotencyKey(idempotencyKey);
        String voucherLink = TrueWalletVoucherLink.validate(request == null ? null : request.voucherLink());
        byte[] fingerprint = fingerprint(voucherLink);
        gateway.requireTrueWalletConfigured();

        Preparation preparation;
        try {
            preparation = transactionTemplate.execute(status ->
                    prepareTransaction(jwt, idempotencyKey, fingerprint));
        } catch (DataIntegrityViolationException exception) {
            if (findByFingerprint(fingerprint).isPresent()) {
                throw new PaymentConflictException("TrueWallet voucher has already been submitted");
            }
            throw new PaymentConflictException("Payment could not be prepared");
        }
        if (preparation == null) throw new PaymentGatewayException("Payment transaction was not created");
        if (preparation.payment().status() != PaymentStatus.PENDING) {
            return toResponse(preparation.payment(), messageFor(preparation.payment().status()));
        }

        ClaimResult claim = transactionTemplate.execute(status -> claimRedemption(preparation.payment()));
        if (claim == null) throw new PaymentGatewayException("Payment redemption could not be started");
        if (!claim.claimed()) return toResponse(claim.payment(), messageFor(claim.payment().status()));

        try {
            InwcloudPaymentGatewayClient.RedeemedPayment redeemed = gateway.redeem(voucherLink);
            if (redeemed.amountMinor() != preparation.payment().amountMinor()) {
                return finalizeReview(
                        preparation.payment(),
                        redeemed.amountMinor(),
                        "Payment amount requires manual review");
            }
            return finalizePaid(preparation.payment(), redeemed.amountMinor());
        } catch (TrueWalletRedeemRejectedException exception) {
            return finalizeFailed(preparation.payment(), "TrueWallet voucher was rejected");
        } catch (PaymentGatewayException exception) {
            return finalizeReview(preparation.payment(), null, "Payment requires manual review");
        }
    }

    public int sweepStaleRedemptions() {
        Integer updated = transactionTemplate.execute(status -> {
            List<Long> paymentIds = jdbc.query("""
                    SELECT p.id AS payment_id
                    FROM payment_transactions p
                    JOIN shop_orders o ON o.id = p.order_id
                    WHERE p.provider = :provider
                      AND o.payment_method = :paymentMethod
                      AND p.status = 'PENDING'
                      AND (
                          (p.redeem_started_at IS NOT NULL
                              AND p.redeem_started_at <= CURRENT_TIMESTAMP - (:staleSeconds * INTERVAL '1 second'))
                          OR (p.redeem_started_at IS NULL
                              AND p.created_at <= CURRENT_TIMESTAMP - (:staleSeconds * INTERVAL '1 second'))
                      )
                    ORDER BY p.id
                    LIMIT 100
                    FOR UPDATE SKIP LOCKED
                    """, new MapSqlParameterSource()
                    .addValue("provider", PROVIDER)
                    .addValue("paymentMethod", PAYMENT_METHOD)
                    .addValue("staleSeconds", STALE_REDEEM_SECONDS),
                    (rs, rowNum) -> rs.getLong("payment_id"));
            int count = 0;
            for (Long paymentId : paymentIds) {
                int paymentUpdated = jdbc.update("""
                        UPDATE payment_transactions p
                        SET status = 'REVIEW', checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        FROM shop_orders o
                        WHERE p.id = :paymentId AND p.provider = :provider AND p.status = 'PENDING'
                          AND o.id = p.order_id AND o.payment_method = :paymentMethod
                        """, new MapSqlParameterSource()
                        .addValue("paymentId", paymentId)
                        .addValue("provider", PROVIDER)
                        .addValue("paymentMethod", PAYMENT_METHOD));
                if (paymentUpdated == 1) {
                    int orderUpdated = jdbc.update("""
                            UPDATE shop_orders
                            SET status = 'PAYMENT_REVIEW', updated_at = CURRENT_TIMESTAMP
                            WHERE id = (SELECT order_id FROM payment_transactions WHERE id = :paymentId
                                        AND provider = :provider)
                              AND status = 'PAYMENT_PENDING' AND payment_method = :paymentMethod
                            """, new MapSqlParameterSource()
                                    .addValue("paymentId", paymentId)
                                    .addValue("provider", PROVIDER)
                                    .addValue("paymentMethod", PAYMENT_METHOD));
                    requireSingleUpdate(orderUpdated, "TrueWallet stale order transition failed");
                    count++;
                }
            }
            return count;
        });
        return updated == null ? 0 : updated;
    }

    private Preparation prepareTransaction(Jwt jwt, String idempotencyKey, byte[] fingerprint) {
        AppUser user = resolveUser(jwt);
        PaymentCheckoutLock.acquire(jdbc, user.getId());
        Optional<PaymentSnapshot> existing = findByIdempotencyKey(user.getId(), idempotencyKey);
        if (existing.isPresent()) {
            PaymentSnapshot payment = existing.get();
            if (!PROVIDER.equals(payment.provider()) || !PAYMENT_METHOD.equals(payment.paymentMethod())
                    || payment.voucherFingerprint() == null
                    || !MessageDigest.isEqual(payment.voucherFingerprint(), fingerprint)) {
                throw new PaymentConflictException("Idempotency key was already used with different payment details");
            }
            return new Preparation(payment, false);
        }
        if (findByFingerprint(fingerprint).isPresent()) {
            throw new PaymentConflictException("TrueWallet voucher has already been submitted");
        }
        ensureNoActivePayment(user.getId());

        Cart cart = cartRepository.findActiveByUserId(user.getId())
                .orElseThrow(() -> new PaymentConflictException("Cart is empty"));
        if (cart.getItems().isEmpty()) throw new PaymentConflictException("Cart is empty");

        Map<Long, Product> products = productRepository.findAllByIdAndActiveTrue(
                        cart.getItems().stream().map(CartItem::getProductId).toList())
                .stream()
                .collect(Collectors.toMap(Product::getId, product -> product, (left, right) -> left, LinkedHashMap::new));
        long totalMinor = 0;
        for (CartItem item : cart.getItems()) {
            Product product = products.get(item.getProductId());
            if (product == null || item.getQuantity() <= 0 || product.getStockQuantity() < item.getQuantity()) {
                throw new PaymentConflictException("Some cart items are unavailable");
            }
            reserveStock(product.getId(), item.getQuantity());
            totalMinor = Math.addExact(totalMinor, Math.multiplyExact((long) product.getPriceMinor(), item.getQuantity()));
        }
        if (totalMinor <= 0) throw new PaymentConflictException("Cart total must be greater than zero");

        List<Long> insertedOrderIds = jdbc.query("""
                INSERT INTO shop_orders (
                    user_id, status, payment_method, currency, total_minor, idempotency_key
                ) VALUES (
                    :userId, 'PAYMENT_PENDING', :paymentMethod, :currency, :totalMinor, :idempotencyKey
                )
                ON CONFLICT (user_id, idempotency_key) DO NOTHING
                RETURNING id
                """, new MapSqlParameterSource()
                .addValue("userId", user.getId())
                .addValue("paymentMethod", PAYMENT_METHOD)
                .addValue("currency", CURRENCY)
                .addValue("totalMinor", totalMinor)
                .addValue("idempotencyKey", idempotencyKey),
                (rs, rowNum) -> rs.getLong("id"));
        if (insertedOrderIds.isEmpty()) {
            throw new PaymentConflictException("Payment idempotency key is already in use");
        }
        long orderId = insertedOrderIds.get(0);
        for (CartItem item : cart.getItems()) {
            Product product = products.get(item.getProductId());
            jdbc.update("""
                    INSERT INTO shop_order_items (
                        order_id, product_id, product_slug, name_th, name_en, unit_price_minor, quantity
                    ) VALUES (
                        :orderId, :productId, :productSlug, :nameTh, :nameEn, :unitPriceMinor, :quantity
                    )
                    """, new MapSqlParameterSource()
                    .addValue("orderId", orderId)
                    .addValue("productId", product.getId())
                    .addValue("productSlug", product.getSlug())
                    .addValue("nameTh", product.getNameTh())
                    .addValue("nameEn", product.getNameEn())
                    .addValue("unitPriceMinor", product.getPriceMinor())
                    .addValue("quantity", item.getQuantity()));
        }
        fulfillmentAllocationService.reserveForPendingOrder(orderId);
        jdbc.update("""
                INSERT INTO payment_transactions (
                    order_id, provider, transaction_id, status, amount_minor, voucher_fingerprint
                ) VALUES (
                    :orderId, :provider, :transactionId, 'PENDING', :amountMinor, :fingerprint
                )
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("provider", PROVIDER)
                .addValue("transactionId", "tw-" + java.util.UUID.randomUUID())
                .addValue("amountMinor", totalMinor)
                .addValue("fingerprint", fingerprint));
        PaymentSnapshot payment = findByIdempotencyKey(user.getId(), idempotencyKey)
                .orElseThrow(() -> new PaymentGatewayException("Payment transaction was not created"));
        return new Preparation(payment, true);
    }


    private void ensureNoActivePayment(long userId) {
        Boolean active = jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1
                    FROM payment_transactions p
                    JOIN shop_orders o ON o.id = p.order_id
                    WHERE o.user_id = :userId
                      AND p.status IN ('PENDING', 'REVIEW')
                      AND o.status IN ('PAYMENT_PENDING', 'PAYMENT_REVIEW')
                )
                """, new MapSqlParameterSource("userId", userId), Boolean.class);
        if (Boolean.TRUE.equals(active)) {
            throw new PaymentConflictException("Another payment is already pending or under review");
        }
    }

    private ClaimResult claimRedemption(PaymentSnapshot payment) {
        if (payment.status() != PaymentStatus.PENDING) return new ClaimResult(payment, false);
        int changed = jdbc.update("""
                UPDATE payment_transactions p
                SET redeem_started_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                FROM shop_orders o
                WHERE p.id = :paymentId AND p.provider = :provider
                  AND p.status = 'PENDING' AND p.redeem_started_at IS NULL
                  AND o.id = p.order_id AND o.payment_method = :paymentMethod
                """, new MapSqlParameterSource()
                .addValue("paymentId", payment.paymentId())
                .addValue("provider", PROVIDER)
                .addValue("paymentMethod", PAYMENT_METHOD));
        if (changed == 1) return new ClaimResult(payment, true);

        PaymentSnapshot latest = findByPaymentId(payment.paymentId()).orElse(payment);
        if (latest.status() == PaymentStatus.PENDING
                && latest.redeemStartedAt() != null
                && latest.redeemStartedAt().isBefore(java.time.Instant.now().minusSeconds(STALE_REDEEM_SECONDS))) {
            int staleUpdated = jdbc.update("""
                    UPDATE payment_transactions p
                    SET status = 'REVIEW', checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    FROM shop_orders o
                    WHERE p.id = :paymentId AND p.provider = :provider
                      AND p.status = 'PENDING' AND p.redeem_started_at IS NOT NULL
                      AND o.id = p.order_id AND o.payment_method = :paymentMethod
                    """, new MapSqlParameterSource()
                    .addValue("paymentId", payment.paymentId())
                    .addValue("provider", PROVIDER)
                    .addValue("paymentMethod", PAYMENT_METHOD));
            if (staleUpdated == 1) {
                int orderChanged = jdbc.update("""
                        UPDATE shop_orders
                        SET status = 'PAYMENT_REVIEW', updated_at = CURRENT_TIMESTAMP
                        WHERE id = :orderId AND payment_method = :paymentMethod AND status = 'PAYMENT_PENDING'
                        """, new MapSqlParameterSource()
                                .addValue("orderId", payment.orderId())
                                .addValue("paymentMethod", PAYMENT_METHOD));
                requireSingleUpdate(orderChanged, "TrueWallet stale order transition failed");
                latest = findByPaymentId(payment.paymentId()).orElse(payment.withStatus(PaymentStatus.REVIEW));
            }
        }
        return new ClaimResult(latest, false);
    }

    private TrueWalletPaymentResponse finalizePaid(PaymentSnapshot current, long providerAmountMinor) {
        return transactionTemplate.execute(status -> {
            int changed = jdbc.update("""
                    UPDATE payment_transactions p
                    SET status = 'PAID', provider_amount_minor = :providerAmountMinor,
                        checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    FROM shop_orders o
                    WHERE p.id = :paymentId AND p.provider = :provider AND p.status = 'PENDING'
                      AND o.id = p.order_id AND o.payment_method = :paymentMethod
                      AND o.status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource()
                    .addValue("paymentId", current.paymentId())
                    .addValue("provider", PROVIDER)
                    .addValue("paymentMethod", PAYMENT_METHOD)
                    .addValue("providerAmountMinor", providerAmountMinor));
            if (changed == 0) {
                return findByPaymentId(current.paymentId())
                        .map(payment -> toResponse(payment, messageFor(payment.status())))
                        .orElse(toResponse(current.withStatus(PaymentStatus.REVIEW), "Payment requires manual review"));
            }
            int orderChanged = jdbc.update("""
                    UPDATE shop_orders
                    SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = :orderId AND payment_method = :paymentMethod AND status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource()
                    .addValue("orderId", current.orderId())
                    .addValue("paymentMethod", PAYMENT_METHOD));
            requireSingleUpdate(orderChanged, "TrueWallet order transition failed");
            removePaidItemsFromCart(current);
            fulfillmentAllocationService.markOrderPaid(current.orderId());
            PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current.withProviderAmount(providerAmountMinor));
            return toResponse(latest, "Payment completed");
        });
    }

    private TrueWalletPaymentResponse finalizeFailed(PaymentSnapshot current, String message) {
        return transactionTemplate.execute(status -> {
            int changed = jdbc.update("""
                    UPDATE payment_transactions p
                    SET status = 'FAILED', checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    FROM shop_orders o
                    WHERE p.id = :paymentId AND p.provider = :provider AND p.status = 'PENDING'
                      AND o.id = p.order_id AND o.payment_method = :paymentMethod
                      AND o.status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource()
                    .addValue("paymentId", current.paymentId())
                    .addValue("provider", PROVIDER)
                    .addValue("paymentMethod", PAYMENT_METHOD));
            if (changed == 1) {
                int orderChanged = jdbc.update("""
                        UPDATE shop_orders
                        SET status = 'FAILED', updated_at = CURRENT_TIMESTAMP
                        WHERE id = :orderId AND payment_method = :paymentMethod AND status = 'PAYMENT_PENDING'
                        """, new MapSqlParameterSource()
                        .addValue("orderId", current.orderId())
                        .addValue("paymentMethod", PAYMENT_METHOD));
                requireSingleUpdate(orderChanged, "TrueWallet order transition failed");
                releaseReservedStock(current.orderId());
                fulfillmentAllocationService.releaseForOrder(current.orderId());
            }
            PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current.withStatus(PaymentStatus.FAILED));
            return toResponse(latest, latest.status() == PaymentStatus.FAILED ? message : messageFor(latest.status()));
        });
    }

    private TrueWalletPaymentResponse finalizeReview(
            PaymentSnapshot current,
            Long providerAmountMinor,
            String message) {
        return transactionTemplate.execute(status -> {
            int changed = jdbc.update("""
                    UPDATE payment_transactions p
                    SET status = 'REVIEW', provider_amount_minor = :providerAmountMinor,
                        checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    FROM shop_orders o
                    WHERE p.id = :paymentId AND p.provider = :provider AND p.status = 'PENDING'
                      AND o.id = p.order_id AND o.payment_method = :paymentMethod
                      AND o.status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource()
                    .addValue("paymentId", current.paymentId())
                    .addValue("provider", PROVIDER)
                    .addValue("paymentMethod", PAYMENT_METHOD)
                    .addValue("providerAmountMinor", providerAmountMinor));
            if (changed == 1) {
                int orderChanged = jdbc.update("""
                        UPDATE shop_orders
                        SET status = 'PAYMENT_REVIEW', updated_at = CURRENT_TIMESTAMP
                        WHERE id = :orderId AND payment_method = :paymentMethod AND status = 'PAYMENT_PENDING'
                        """, new MapSqlParameterSource()
                        .addValue("orderId", current.orderId())
                        .addValue("paymentMethod", PAYMENT_METHOD));
                requireSingleUpdate(orderChanged, "TrueWallet order transition failed");
            }
            PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current.withStatus(PaymentStatus.REVIEW));
            return toResponse(latest, latest.status() == PaymentStatus.REVIEW ? message : messageFor(latest.status()));
        });
    }

    private static void requireSingleUpdate(int changed, String message) {
        if (changed != 1) throw new PaymentGatewayException(message);
    }

    private void removePaidItemsFromCart(PaymentSnapshot payment) {
        jdbc.update("""
                DELETE FROM cart_items AS cart_item
                USING shop_order_items AS order_item
                WHERE cart_item.cart_id IN (
                    SELECT id FROM carts WHERE user_id = :userId AND status = 'ACTIVE'
                )
                  AND order_item.order_id = :orderId
                  AND cart_item.product_id = order_item.product_id
                  AND cart_item.quantity <= order_item.quantity
                """, new MapSqlParameterSource()
                .addValue("userId", payment.userId())
                .addValue("orderId", payment.orderId()));
        jdbc.update("""
                UPDATE cart_items AS cart_item
                SET quantity = cart_item.quantity - order_item.quantity
                FROM shop_order_items AS order_item
                WHERE cart_item.cart_id IN (
                    SELECT id FROM carts WHERE user_id = :userId AND status = 'ACTIVE'
                )
                  AND order_item.order_id = :orderId
                  AND cart_item.product_id = order_item.product_id
                  AND cart_item.quantity > order_item.quantity
                """, new MapSqlParameterSource()
                .addValue("userId", payment.userId())
                .addValue("orderId", payment.orderId()));
        jdbc.update("""
                UPDATE carts
                SET version = version + 1, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = :userId AND status = 'ACTIVE'
                """, new MapSqlParameterSource("userId", payment.userId()));
    }

    private void reserveStock(long productId, int quantity) {
        Boolean reserved = jdbc.queryForObject("SELECT reserve_product_stock(:productId, :quantity)",
                new MapSqlParameterSource().addValue("productId", productId).addValue("quantity", quantity),
                Boolean.class);
        if (!Boolean.TRUE.equals(reserved)) throw new PaymentConflictException("Some cart items are unavailable");
    }

    private void releaseReservedStock(long orderId) {
        List<OrderLine> lines = jdbc.query("""
                SELECT product_id, quantity FROM shop_order_items WHERE order_id = :orderId
                """, new MapSqlParameterSource("orderId", orderId), ORDER_LINE_ROW);
        releaseReservedStock(lines);
    }

    private void releaseReservedStock(List<OrderLine> lines) {
        for (OrderLine line : lines) {
            jdbc.queryForObject("SELECT release_product_stock(:productId, :quantity)",
                    new MapSqlParameterSource()
                            .addValue("productId", line.productId())
                            .addValue("quantity", line.quantity()),
                    Boolean.class);
        }
    }

    private Optional<PaymentSnapshot> findByIdempotencyKey(long userId, String idempotencyKey) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       o.payment_method, p.provider, p.transaction_id, p.status,
                       p.amount_minor, p.provider_amount_minor, o.currency,
                       p.voucher_fingerprint, p.redeem_started_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE o.user_id = :userId AND o.idempotency_key = :idempotencyKey
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("idempotencyKey", idempotencyKey), PAYMENT_ROW)
                .stream().findFirst();
    }

    private Optional<PaymentSnapshot> findByFingerprint(byte[] fingerprint) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       o.payment_method, p.provider, p.transaction_id, p.status,
                       p.amount_minor, p.provider_amount_minor, o.currency,
                       p.voucher_fingerprint, p.redeem_started_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE p.provider = :provider
                  AND o.payment_method = :paymentMethod
                  AND p.voucher_fingerprint = :fingerprint
                """, new MapSqlParameterSource()
                .addValue("provider", PROVIDER)
                .addValue("paymentMethod", PAYMENT_METHOD)
                .addValue("fingerprint", fingerprint), PAYMENT_ROW)
                .stream().findFirst();
    }

    private Optional<PaymentSnapshot> findByPaymentId(long paymentId) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       o.payment_method, p.provider, p.transaction_id, p.status,
                       p.amount_minor, p.provider_amount_minor, o.currency,
                       p.voucher_fingerprint, p.redeem_started_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE p.id = :paymentId
                  AND p.provider = :provider
                  AND o.payment_method = :paymentMethod
                """, new MapSqlParameterSource()
                .addValue("paymentId", paymentId)
                .addValue("provider", PROVIDER)
                .addValue("paymentMethod", PAYMENT_METHOD), PAYMENT_ROW)
                .stream().findFirst();
    }

    private AppUser resolveUser(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new PaymentConflictException("Authenticated user is required");
        }
        String issuer = jwt.getIssuer().toString();
        String email = jwt.getClaimAsString("email");
        String displayName = firstNonBlank(jwt.getClaimAsString("name"), jwt.getClaimAsString("preferred_username"), email,
                jwt.getSubject());
        return userRepository.findByIssuerAndSubject(issuer, jwt.getSubject())
                .map(existing -> {
                    existing.updateProfile(email, displayName);
                    return existing;
                })
                .orElseGet(() -> userRepository.save(new AppUser(issuer, jwt.getSubject(), email, displayName)));
    }

    private void ensureEnabled() {
        if (!enabled) throw new PaymentConfigurationException("TrueWallet payment is not enabled");
    }

    private byte[] fingerprint(String voucherLink) {
        byte[] key;
        try {
            key = decodeKey(fingerprintKeyBase64);
        } catch (IllegalArgumentException exception) {
            throw new PaymentConfigurationException("TrueWallet fingerprint key is not configured");
        }
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal((FINGERPRINT_CONTEXT + voucherLink).getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new PaymentConfigurationException("TrueWallet fingerprinting is unavailable");
        }
    }

    private static byte[] decodeKey(String encoded) {
        if (encoded == null || encoded.isBlank()) throw new IllegalArgumentException("missing key");
        byte[] decoded;
        try {
            decoded = Base64.getUrlDecoder().decode(encoded);
        } catch (IllegalArgumentException urlException) {
            decoded = Base64.getDecoder().decode(encoded);
        }
        if (decoded.length < 32) throw new IllegalArgumentException("key is too short");
        return decoded;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "Unknown phutoshop user";
    }

    private static void validateIdempotencyKey(String value) {
        if (value == null || !IDEMPOTENCY_KEY.matcher(value).matches()) {
            throw new PaymentConflictException("Idempotency key is invalid");
        }
    }

    private static TrueWalletPaymentResponse toResponse(PaymentSnapshot payment, String message) {
        return new TrueWalletPaymentResponse(
                payment.orderId(),
                payment.transactionId(),
                payment.amountMinor(),
                payment.currency(),
                payment.providerAmountMinor(),
                payment.status(),
                message);
    }

    private static String messageFor(PaymentStatus status) {
        return switch (status) {
            case PAID -> "Payment completed";
            case FAILED -> "TrueWallet voucher was rejected";
            case PENDING -> "Payment redemption is in progress";
            case REVIEW -> "Payment requires manual review";
            case EXPIRED -> "Payment expired";
            case CANCELLED -> "Payment cancelled";
        };
    }

    private static PaymentSnapshot mapPayment(ResultSet rs, int rowNum) throws SQLException {
        Timestamp redeemStartedAt = rs.getTimestamp("redeem_started_at");
        long providerAmount = rs.getLong("provider_amount_minor");
        return new PaymentSnapshot(
                rs.getLong("payment_id"),
                rs.getLong("order_id"),
                rs.getLong("user_id"),
                rs.getString("payment_method"),
                rs.getString("provider"),
                rs.getString("transaction_id"),
                PaymentStatus.valueOf(rs.getString("status").toUpperCase(Locale.ROOT)),
                rs.getLong("amount_minor"),
                rs.wasNull() ? null : providerAmount,
                rs.getString("currency"),
                rs.getBytes("voucher_fingerprint"),
                redeemStartedAt == null ? null : redeemStartedAt.toInstant());
    }

    private record Preparation(PaymentSnapshot payment, boolean created) {
    }

    private record ClaimResult(PaymentSnapshot payment, boolean claimed) {
    }

    private record OrderLine(long productId, int quantity) {
    }

    private record PaymentSnapshot(
            long paymentId,
            long orderId,
            long userId,
            String paymentMethod,
            String provider,
            String transactionId,
            PaymentStatus status,
            long amountMinor,
            Long providerAmountMinor,
            String currency,
            byte[] voucherFingerprint,
            java.time.Instant redeemStartedAt) {

        PaymentSnapshot withStatus(PaymentStatus nextStatus) {
            return new PaymentSnapshot(paymentId, orderId, userId, paymentMethod, provider, transactionId, nextStatus,
                    amountMinor, providerAmountMinor, currency, voucherFingerprint, redeemStartedAt);
        }

        PaymentSnapshot withProviderAmount(long nextProviderAmountMinor) {
            return new PaymentSnapshot(paymentId, orderId, userId, paymentMethod, provider, transactionId, status,
                    amountMinor, nextProviderAmountMinor, currency, voucherFingerprint, redeemStartedAt);
        }
    }
}
