package com.plutoshop.api.productimage;

import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProductImageValidationTest {

    @TempDir
    Path root;

    @Test
    void rejectsAnImageContentTypeHintThatDoesNotMatchTheImageBytes() throws IOException {
        BufferedImage image = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        ImageIO.write(image, "jpg", output);
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);

        assertThrows(ProductImageValidationException.class,
                () -> storage.store(new ByteArrayInputStream(output.toByteArray()), "image/png"));
    }

    @Test
    void rejectsNonImageBytesEvenWhenTheBrowserClaimsAnAllowedType() {
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);

        assertThrows(ProductImageValidationException.class,
                () -> storage.store(new ByteArrayInputStream("not an image".getBytes()), "image/jpeg"));
    }
}
