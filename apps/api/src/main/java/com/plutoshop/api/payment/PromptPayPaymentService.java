package com.plutoshop.api.payment;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.plutoshop.api.cart.Cart;
import com.plutoshop.api.cart.CartItem;
import com.plutoshop.api.cart.CartRepository;
import com.plutoshop.api.catalog.Product;
import com.plutoshop.api.catalog.ProductRepository;
import com.plutoshop.api.fulfillment.FulfillmentAllocationService;
import com.plutoshop.api.user.AppUser;
import com.plutoshop.api.user.AppUserRepository;

@Service
public class PromptPayPaymentService {

    private static final String CURRENCY = "THB";
    private static final String PROVIDER = "INWCLOUD";
    // Inwcloud adds a bounded random-satang marker to the requested THB amount.
    // Keep the server-calculated order total authoritative and store the provider amount separately.
    private static final long MAX_RANDOM_SATANG = 99;
    private static final Logger LOGGER = LoggerFactory.getLogger(PromptPayPaymentService.class);
    private static final Pattern IDEMPOTENCY_KEY = Pattern.compile("[A-Za-z0-9._:-]{16,100}");
    private static final Pattern TRANSACTION_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]{0,119}");
    private static final RowMapper<PaymentSnapshot> PAYMENT_ROW = PromptPayPaymentService::mapPayment;
    private static final RowMapper<OrderLine> ORDER_LINE_ROW = (rs, rowNum) ->
            new OrderLine(rs.getLong("product_id"), rs.getInt("quantity"));

    private final AppUserRepository userRepository;
    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final NamedParameterJdbcTemplate jdbc;
    private final InwcloudPaymentGatewayClient gateway;
    private final FulfillmentAllocationService fulfillmentAllocationService;
    private final boolean promptPayBlackoutEnforced;

    PromptPayPaymentService(
            AppUserRepository userRepository,
            CartRepository cartRepository,
            ProductRepository productRepository,
            @org.springframework.beans.factory.annotation.Qualifier("userJdbcTemplate") NamedParameterJdbcTemplate jdbc,
            InwcloudPaymentGatewayClient gateway,
            FulfillmentAllocationService fulfillmentAllocationService,
            @org.springframework.beans.factory.annotation.Value("${payment.inwcloud.promptpay-blackout-enforced:true}") boolean promptPayBlackoutEnforced) {
        this.userRepository = userRepository;
        this.cartRepository = cartRepository;
        this.productRepository = productRepository;
        this.jdbc = jdbc;
        this.gateway = gateway;
        this.fulfillmentAllocationService = fulfillmentAllocationService;
        this.promptPayBlackoutEnforced = promptPayBlackoutEnforced;
    }

    @Transactional
    public PromptPayCheckoutResponse createPromptPay(Jwt jwt, String idempotencyKey) {
        if (promptPayBlackoutEnforced && !PromptPayAvailability.isAvailableAt(Instant.now())) {
            throw new PromptPayUnavailableException();
        }
        validateIdempotencyKey(idempotencyKey);
        AppUser user = resolveUser(jwt);
        Optional<PaymentSnapshot> existing = findByIdempotencyKey(user.getId(), idempotencyKey);
        if (existing.isPresent()) return toCheckoutResponse(existing.get());

        Cart cart = cartRepository.findActiveByUserId(user.getId())
                .orElseThrow(() -> new PaymentConflictException("Cart is empty"));
        if (cart.getItems().isEmpty()) throw new PaymentConflictException("Cart is empty");

        Map<Long, Product> products = productRepository.findAllByIdAndActiveTrue(
                        cart.getItems().stream().map(CartItem::getProductId).toList())
                .stream()
                .collect(Collectors.toMap(Product::getId, product -> product, (left, right) -> left, LinkedHashMap::new));
        List<OrderLine> reservedLines = new ArrayList<>();
        long totalMinor = 0;
        for (CartItem item : cart.getItems()) {
            Product product = products.get(item.getProductId());
            if (product == null || item.getQuantity() <= 0 || product.getStockQuantity() < item.getQuantity()) {
                throw new PaymentConflictException("Some cart items are unavailable");
            }
            reserveStock(product.getId(), item.getQuantity());
            reservedLines.add(new OrderLine(product.getId(), item.getQuantity()));
            totalMinor = Math.addExact(totalMinor, Math.multiplyExact((long) product.getPriceMinor(), item.getQuantity()));
        }
        if (totalMinor <= 0) throw new PaymentConflictException("Cart total must be greater than zero");

        MapSqlParameterSource orderParameters = new MapSqlParameterSource()
                .addValue("userId", user.getId())
                .addValue("currency", CURRENCY)
                .addValue("totalMinor", totalMinor)
                .addValue("idempotencyKey", idempotencyKey);
        List<Long> insertedOrderIds = jdbc.query("""
                INSERT INTO shop_orders (
                    user_id, status, payment_method, currency, total_minor, idempotency_key
                ) VALUES (
                    :userId, 'PAYMENT_PENDING', 'PROMPTPAY', :currency, :totalMinor, :idempotencyKey
                )
                ON CONFLICT (user_id, idempotency_key) DO NOTHING
                RETURNING id
                """, orderParameters, (rs, rowNum) -> rs.getLong("id"));
        if (insertedOrderIds.isEmpty()) {
            releaseReservedStock(reservedLines);
            return findByIdempotencyKey(user.getId(), idempotencyKey)
                    .map(PromptPayPaymentService::toCheckoutResponse)
                    .orElseThrow(() -> new PaymentGatewayException("Payment transaction was not created"));
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

        InwcloudPaymentGatewayClient.GeneratedPayment generated = gateway.generate(
                BigDecimal.valueOf(totalMinor, 2));
        long providerRandomSatang = generated.amountMinor() >= totalMinor
                ? Math.subtractExact(generated.amountMinor(), totalMinor)
                : -1;
        if (providerRandomSatang < 0 || providerRandomSatang > MAX_RANDOM_SATANG) {
            LOGGER.warn(
                    "PromptPay amount mismatch server_total_minor={} provider_amount_minor={} request_amount_thb={} provider_random_satang={}",
                    totalMinor,
                    generated.amountMinor(),
                    BigDecimal.valueOf(totalMinor, 2),
                    providerRandomSatang);
            throw new PaymentGatewayException("Payment gateway amount does not match order total");
        }
        jdbc.update("""
                INSERT INTO payment_transactions (
                    order_id, provider, transaction_id, status, amount_minor,
                    qr_url, payload, expires_at
                ) VALUES (
                    :orderId, :provider, :transactionId, 'PENDING', :amountMinor,
                    :qrUrl, :payload, :expiresAt
                )
                """, new MapSqlParameterSource()
                .addValue("orderId", orderId)
                .addValue("provider", PROVIDER)
                .addValue("transactionId", generated.transactionId())
                .addValue("amountMinor", generated.amountMinor())
                .addValue("qrUrl", generated.qrUrl().toString())
                .addValue("payload", generated.payload())
                .addValue("expiresAt", Timestamp.from(generated.expiresAt())));

        PaymentSnapshot payment = findByIdempotencyKey(user.getId(), idempotencyKey)
                .orElseThrow(() -> new PaymentGatewayException("Payment transaction was not created"));
        return toCheckoutResponse(payment);
    }

    @Transactional
    public PromptPayStatusResponse checkPromptPay(Jwt jwt, String transactionId) {
        if (transactionId == null || !TRANSACTION_ID.matcher(transactionId).matches()) {
            throw new PaymentConflictException("Payment transaction is invalid");
        }
        AppUser user = resolveUser(jwt);
        PaymentSnapshot current = findByTransaction(user.getId(), transactionId)
                .orElseThrow(PaymentNotFoundException::new);
        if (current.status() != PaymentStatus.PENDING) return toStatusResponse(current, messageFor(current.status()));
        if (current.expiresAt() != null && !current.expiresAt().isAfter(Instant.now())) {
            return transition(current, PaymentStatus.EXPIRED, "Payment QR code expired");
        }

        InwcloudPaymentGatewayClient.CheckedPayment checked = gateway.check(transactionId);
        return switch (checked.status()) {
            case PAID -> transition(current, PaymentStatus.PAID, "Payment completed");
            case FAILED -> transition(current, PaymentStatus.FAILED, "Payment was not completed");
            case PENDING -> {
                int changed = jdbc.update("""
                        UPDATE payment_transactions
                        SET checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                        WHERE id = :paymentId AND status = 'PENDING'
                        """, new MapSqlParameterSource("paymentId", current.paymentId()));
                if (changed == 0) {
                    PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current);
                    yield toStatusResponse(latest, messageFor(latest.status()));
                }
                yield toStatusResponse(current, "Payment is still pending");
            }
        };
    }

    @Transactional
    public PromptPayStatusResponse cancelPromptPay(Jwt jwt, String transactionId) {
        if (transactionId == null || !TRANSACTION_ID.matcher(transactionId).matches()) {
            throw new PaymentConflictException("Payment transaction is invalid");
        }
        AppUser user = resolveUser(jwt);
        PaymentSnapshot current = findByTransaction(user.getId(), transactionId)
                .orElseThrow(PaymentNotFoundException::new);
        if (current.status() == PaymentStatus.CANCELLED) {
            return toStatusResponse(current, "Payment cancelled");
        }
        if (current.status() != PaymentStatus.PENDING) {
            throw new PaymentConflictException("Payment cannot be cancelled");
        }

        PromptPayStatusResponse cancelled = transition(current, PaymentStatus.CANCELLED, "Payment cancelled");
        if (cancelled.status() == PaymentStatus.CANCELLED) return cancelled;
        throw new PaymentConflictException("Payment cannot be cancelled");
    }

    @Transactional
    public void sweepExpiredPayments() {
        List<PaymentSnapshot> expiredPayments = jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       p.transaction_id, p.status, p.amount_minor, o.currency,
                       p.qr_url, p.payload, p.expires_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE p.status = 'PENDING'
                  AND p.expires_at IS NOT NULL
                  AND p.expires_at <= CURRENT_TIMESTAMP
                ORDER BY p.id
                LIMIT 100
                FOR UPDATE OF p SKIP LOCKED
                """, new MapSqlParameterSource(), PAYMENT_ROW);
        for (PaymentSnapshot payment : expiredPayments) {
            transition(payment, PaymentStatus.EXPIRED, "Payment QR code expired");
        }
    }

    private PromptPayStatusResponse transition(PaymentSnapshot current, PaymentStatus status, String message) {
        int changed = jdbc.update("""
                UPDATE payment_transactions
                SET status = :status, checked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                WHERE id = :paymentId AND status = 'PENDING'
                """, new MapSqlParameterSource()
                .addValue("status", status.name())
                .addValue("paymentId", current.paymentId()));
        if (changed == 0) {
            PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current);
            return toStatusResponse(latest, messageFor(latest.status()));
        }

        if (status == PaymentStatus.PAID) {
            jdbc.update("""
                    UPDATE shop_orders
                    SET status = 'PAID', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = :orderId AND status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource("orderId", current.orderId()));
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
                    .addValue("userId", current.userId())
                    .addValue("orderId", current.orderId()));
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
                    .addValue("userId", current.userId())
                    .addValue("orderId", current.orderId()));
            jdbc.update("""
                    UPDATE carts
                    SET version = version + 1, updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = :userId AND status = 'ACTIVE'
                    """, new MapSqlParameterSource("userId", current.userId()));
            fulfillmentAllocationService.markOrderPaid(current.orderId());
        } else {
            jdbc.update("""
                    UPDATE shop_orders
                    SET status = :status, updated_at = CURRENT_TIMESTAMP
                    WHERE id = :orderId AND status = 'PAYMENT_PENDING'
                    """, new MapSqlParameterSource()
                    .addValue("status", status.name())
                    .addValue("orderId", current.orderId()));
            releaseReservedStock(current.orderId());
            fulfillmentAllocationService.releaseForOrder(current.orderId());
        }
        PaymentSnapshot latest = findByPaymentId(current.paymentId()).orElse(current.withStatus(status));
        return toStatusResponse(latest, message);
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
                    new MapSqlParameterSource().addValue("productId", line.productId()).addValue("quantity", line.quantity()),
                    Boolean.class);
        }
    }

    private Optional<PaymentSnapshot> findByIdempotencyKey(long userId, String idempotencyKey) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       p.transaction_id, p.status, p.amount_minor, o.currency,
                       p.qr_url, p.payload, p.expires_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE o.user_id = :userId AND o.idempotency_key = :idempotencyKey
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("idempotencyKey", idempotencyKey), PAYMENT_ROW)
                .stream().findFirst();
    }

    private Optional<PaymentSnapshot> findByTransaction(long userId, String transactionId) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       p.transaction_id, p.status, p.amount_minor, o.currency,
                       p.qr_url, p.payload, p.expires_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE o.user_id = :userId AND p.transaction_id = :transactionId
                """, new MapSqlParameterSource()
                .addValue("userId", userId)
                .addValue("transactionId", transactionId), PAYMENT_ROW)
                .stream().findFirst();
    }

    private Optional<PaymentSnapshot> findByPaymentId(long paymentId) {
        return jdbc.query("""
                SELECT p.id AS payment_id, o.id AS order_id, o.user_id,
                       p.transaction_id, p.status, p.amount_minor, o.currency,
                       p.qr_url, p.payload, p.expires_at
                FROM payment_transactions p
                JOIN shop_orders o ON o.id = p.order_id
                WHERE p.id = :paymentId
                """, new MapSqlParameterSource("paymentId", paymentId), PAYMENT_ROW)
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

    private static String firstNonBlank(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return "Unknown Pluto Shop user";
    }

    private static void validateIdempotencyKey(String value) {
        if (value == null || !IDEMPOTENCY_KEY.matcher(value).matches()) {
            throw new PaymentConflictException("Idempotency key is invalid");
        }
    }

    private static PromptPayCheckoutResponse toCheckoutResponse(PaymentSnapshot payment) {
        return new PromptPayCheckoutResponse(payment.orderId(), payment.transactionId(), payment.amountMinor(),
                payment.currency(), payment.qrUrl(), payment.payload(), payment.expiresAt(), payment.status());
    }

    private static PromptPayStatusResponse toStatusResponse(PaymentSnapshot payment, String message) {
        return new PromptPayStatusResponse(payment.orderId(), payment.transactionId(), payment.amountMinor(),
                payment.currency(), payment.expiresAt(), payment.status(), message);
    }

    private static String messageFor(PaymentStatus status) {
        return switch (status) {
            case PAID -> "Payment completed";
            case EXPIRED -> "Payment QR code expired";
            case FAILED -> "Payment was not completed";
            case CANCELLED -> "Payment cancelled";
            case PENDING -> "Payment is still pending";
        };
    }

    private static PaymentSnapshot mapPayment(ResultSet rs, int rowNum) throws SQLException {
        Timestamp expiresAt = rs.getTimestamp("expires_at");
        return new PaymentSnapshot(
                rs.getLong("payment_id"),
                rs.getLong("order_id"),
                rs.getLong("user_id"),
                rs.getString("transaction_id"),
                PaymentStatus.valueOf(rs.getString("status").toUpperCase(Locale.ROOT)),
                rs.getLong("amount_minor"),
                rs.getString("currency"),
                rs.getString("qr_url"),
                rs.getString("payload"),
                expiresAt == null ? null : expiresAt.toInstant());
    }

    private record OrderLine(long productId, int quantity) {
    }

    private record PaymentSnapshot(
            long paymentId,
            long orderId,
            long userId,
            String transactionId,
            PaymentStatus status,
            long amountMinor,
            String currency,
            String qrUrl,
            String payload,
            Instant expiresAt) {

        PaymentSnapshot withStatus(PaymentStatus nextStatus) {
            return new PaymentSnapshot(paymentId, orderId, userId, transactionId, nextStatus, amountMinor, currency,
                    qrUrl, payload, expiresAt);
        }
    }
}
