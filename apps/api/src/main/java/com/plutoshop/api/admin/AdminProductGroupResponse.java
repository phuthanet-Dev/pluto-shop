package com.plutoshop.api.admin;

import java.time.Instant;
import java.util.List;

public record AdminProductGroupResponse(
        String optionGroup,
        String nameTh,
        String nameEn,
        String shortDescriptionTh,
        String shortDescriptionEn,
        Instant updatedAt,
        String updatedBy,
        long version,
        List<AdminProductResponse> items) {
}
