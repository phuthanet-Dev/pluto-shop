package com.plutoshop.api.cart;

import java.util.List;

public record CartResponse(
        List<CartItemResponse> items,
        List<Long> removedProductIds,
        long version) {
}
