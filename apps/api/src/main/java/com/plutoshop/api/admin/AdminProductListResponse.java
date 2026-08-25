package com.plutoshop.api.admin;

import java.util.List;

public record AdminProductListResponse(List<AdminProductResponse> items, long total) {
}
