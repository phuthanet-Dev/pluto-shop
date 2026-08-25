package com.plutoshop.api.cart;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import jakarta.persistence.EntityManager;

import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.plutoshop.api.catalog.Product;
import com.plutoshop.api.catalog.ProductRepository;
import com.plutoshop.api.user.AppUser;
import com.plutoshop.api.user.AppUserRepository;

@Service
public class CartService {

    private static final int MAX_QUANTITY = 99;

    private final AppUserRepository userRepository;
    private final CartRepository cartRepository;
    private final ProductRepository productRepository;
    private final EntityManager entityManager;

    CartService(
            AppUserRepository userRepository,
            CartRepository cartRepository,
            ProductRepository productRepository,
            EntityManager entityManager) {
        this.userRepository = userRepository;
        this.cartRepository = cartRepository;
        this.productRepository = productRepository;
        this.entityManager = entityManager;
    }

    @Transactional
    public CartResponse getCart(Jwt jwt) {
        Cart cart = activeCart(resolveUser(jwt));
        Map<Long, Integer> stored = cart.getItems().stream()
                .collect(Collectors.toMap(CartItem::getProductId, CartItem::getQuantity, Integer::sum, LinkedHashMap::new));
        return replaceItems(cart, stored);
    }

    @Transactional
    public CartResponse replace(Jwt jwt, CartWriteRequest request) {
        Cart cart = activeCart(resolveUser(jwt));
        return replaceItems(cart, request.items().stream().collect(Collectors.toMap(
                CartItemRequest::productId,
                CartItemRequest::quantity,
                (left, right) -> Math.min(MAX_QUANTITY, left + right),
                LinkedHashMap::new)));
    }

    @Transactional
    public CartResponse merge(Jwt jwt, CartWriteRequest request) {
        Cart cart = activeCart(resolveUser(jwt));
        Map<Long, Integer> merged = cart.getItems().stream()
                .collect(Collectors.toMap(CartItem::getProductId, CartItem::getQuantity, Integer::sum, LinkedHashMap::new));
        for (CartItemRequest item : request.items()) {
            long sum = (long) merged.getOrDefault(item.productId(), 0) + item.quantity();
            merged.put(item.productId(), (int) Math.min(MAX_QUANTITY, sum));
        }
        return replaceItems(cart, merged);
    }

    @Transactional
    public void clear(Jwt jwt) {
        Cart cart = activeCart(resolveUser(jwt));
        cart.clearItems();
        cartRepository.save(cart);
    }

    private CartResponse replaceItems(Cart cart, Map<Long, Integer> requested) {
        Map<Long, Product> products = productRepository.findAllById(requested.keySet()).stream()
                .collect(Collectors.toMap(Product::getId, Function.identity()));
        List<Long> removed = new ArrayList<>();
        cart.clearItems();
        entityManager.flush();
        for (Map.Entry<Long, Integer> entry : requested.entrySet()) {
            Product product = products.get(entry.getKey());
            if (product == null || product.getStockQuantity() <= 0) {
                removed.add(entry.getKey());
                continue;
            }
            int quantity = Math.min(entry.getValue(), Math.min(MAX_QUANTITY, product.getStockQuantity()));
            if (quantity > 0) cart.addItem(entry.getKey(), quantity);
        }
        Cart saved = cartRepository.save(cart);
        return new CartResponse(
                saved.getItems().stream().map(item -> new CartItemResponse(item.getProductId(), item.getQuantity())).toList(),
                List.copyOf(removed),
                saved.getVersion());
    }

    private Cart activeCart(AppUser user) {
        return cartRepository.findActiveByUserId(user.getId()).orElseGet(() -> cartRepository.save(new Cart(user)));
    }

    private AppUser resolveUser(Jwt jwt) {
        if (jwt == null || jwt.getSubject() == null || jwt.getSubject().isBlank() || jwt.getIssuer() == null) {
            throw new IllegalArgumentException("Authenticated subject is required");
        }
        String email = jwt.getClaimAsString("email");
        String displayName = firstNonBlank(
                jwt.getClaimAsString("name"),
                jwt.getClaimAsString("preferred_username"),
                email,
                jwt.getSubject());
        String issuer = jwt.getIssuer().toString();
        return userRepository.findByIssuerAndSubject(issuer, jwt.getSubject())
                .map(existing -> {
                    existing.updateProfile(email, displayName);
                    return existing;
                })
                .orElseGet(() -> userRepository.save(new AppUser(issuer, jwt.getSubject(), email, displayName)));
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return "Unknown Pluto Shop user";
    }
}
