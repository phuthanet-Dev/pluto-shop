package com.plutoshop.api.productimage;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import com.plutoshop.api.admin.AdminProductService;

@ExtendWith(MockitoExtension.class)
class AdminProductImageServiceTest {

    @Mock
    private NamedParameterJdbcTemplate jdbc;

    @Mock
    private AdminProductService productService;

    @Mock
    private ProductImageStorage storage;

    @Test
    void previewReadsKeyAndMetadataFromOneConsistentDatabaseSnapshot() throws Exception {
        byte[] bytes = {1, 2, 3};
        when(jdbc.query(
                anyString(),
                any(MapSqlParameterSource.class),
                org.mockito.ArgumentMatchers.<RowMapper<ProductImagePreviewMetadata>>any()))
                .thenReturn(List.of(new ProductImagePreviewMetadata("new-key", "image/png", 3L)));
        when(storage.open("new-key")).thenReturn(new ByteArrayInputStream(bytes));

        AdminProductImage result = new AdminProductImageService(jdbc, productService, storage).preview(42);

        assertEquals("image/png", result.contentType());
        assertEquals(3, result.sizeBytes());
        assertArrayEquals(bytes, result.content().readAllBytes());
        verifyNoInteractions(productService);
    }
}
