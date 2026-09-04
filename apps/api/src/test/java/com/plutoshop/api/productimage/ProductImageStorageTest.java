package com.plutoshop.api.productimage;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.io.TempDir;

class ProductImageStorageTest {

    @TempDir
    Path root;

    @Test
    void storesValidJpegWithGeneratedKeyAndMetadata() throws Exception {
        byte[] bytes = imageBytes("jpg", 640, 480);
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);

        ProductImageMetadata metadata = storage.store(new ByteArrayInputStream(bytes), "image/jpeg");

        assertTrue(UUID.fromString(metadata.key()) != null);
        assertEquals("image/jpeg", metadata.contentType());
        assertEquals(bytes.length, metadata.sizeBytes());
        assertEquals(640, metadata.width());
        assertEquals(480, metadata.height());
        assertTrue(metadata.sha256().matches("[0-9a-f]{64}"));
        assertArrayEquals(bytes, readAll(storage.open(metadata.key())));
        assertTrue(Files.isRegularFile(root.resolve(metadata.key())));
    }

    @Test
    void storesValidPngAndDoesNotUseTheOriginalFilenameAsAKey() throws Exception {
        byte[] bytes = imageBytes("png", 32, 24);
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);

        ProductImageMetadata metadata = storage.store(new ByteArrayInputStream(bytes), "image/png; filename=../../secret");

        assertEquals("image/png", metadata.contentType());
        assertTrue(metadata.key().matches("[0-9a-f-]{36}"));
        assertTrue(!metadata.key().contains("secret"));
    }

    @Test
    void replacementCleanupDeletesOnlyTheRequestedKey() throws Exception {
        byte[] bytes = imageBytes("jpg", 16, 16);
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);
        ProductImageMetadata first = storage.store(new ByteArrayInputStream(bytes), "image/jpeg");
        ProductImageMetadata second = storage.store(new ByteArrayInputStream(bytes), "image/jpeg");

        storage.delete(first.key());

        assertTrue(!storage.exists(first.key()));
        assertTrue(storage.exists(second.key()));
        assertTrue(Files.list(root).allMatch(path -> !path.getFileName().toString().endsWith(".tmp")));
    }

    @Test
    void rejectsOversizedPayloadBeforeKeepingAFile() throws Exception {
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root, 32, 4096, 16_777_216L);
        byte[] bytes = imageBytes("jpg", 640, 480);

        assertThrows(ProductImageValidationException.class,
                () -> storage.store(new ByteArrayInputStream(bytes), "image/jpeg"));
        assertTrue(Files.list(root).findAny().isEmpty());
    }

    @Test
    void rejectsDimensionsAboveTheConfiguredLimit() throws Exception {
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root, 5 * 1024 * 1024L, 4096, 16_777_216L);
        byte[] bytes = imageBytes("png", 4097, 1);

        assertThrows(ProductImageValidationException.class,
                () -> storage.store(new ByteArrayInputStream(bytes), "image/png"));
        assertTrue(Files.list(root).findAny().isEmpty());
    }

    @Test
    void rejectsTraversalAndNonUuidKeysBeforeOpeningFiles() throws Exception {
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(root);

        assertThrows(ProductImageValidationException.class,
                () -> storage.open("../outside"));
        assertThrows(ProductImageValidationException.class,
                () -> storage.delete("C:\\secret\\image.jpg"));
    }

    @Test
    void rejectsAConfiguredRootThatContainsASymlinkedParent() throws Exception {
        Path realDirectory = Files.createDirectory(root.resolve("real-media"));
        Path linkedDirectory = root.resolve("linked-media");
        createSymlinkOrSkip(linkedDirectory, realDirectory);

        assertThrows(IllegalStateException.class,
                () -> new FileSystemProductImageStorage(linkedDirectory.resolve("nested")));
    }

    @Test
    void refusesToWriteOutsideTheConfiguredRootWhenTheRootBecomesASymlink() throws Exception {
        Path mediaRoot = root.resolve("media");
        FileSystemProductImageStorage storage = new FileSystemProductImageStorage(mediaRoot);
        Path outsideDirectory = Files.createDirectory(root.resolve("outside"));
        Files.delete(mediaRoot);
        createSymlinkOrSkip(mediaRoot, outsideDirectory);

        assertThrows(ProductImageStorageException.class,
                () -> storage.store(new ByteArrayInputStream(imageBytes("jpg", 16, 16)), "image/jpeg"));
        try (var paths = Files.list(outsideDirectory)) {
            assertTrue(paths.findAny().isEmpty());
        }
    }

    private static void createSymlinkOrSkip(Path link, Path target) throws IOException {
        try {
            Files.createSymbolicLink(link, target);
        } catch (IOException | UnsupportedOperationException | SecurityException exception) {
            Assumptions.assumeTrue(false, "Symbolic links are unavailable in this test environment");
        }
    }

    private static byte[] imageBytes(String format, int width, int height) throws IOException {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        assertTrue(ImageIO.write(image, format, output));
        return output.toByteArray();
    }

    private static byte[] readAll(InputStream input) throws IOException {
        try (input) {
            return input.readAllBytes();
        }
    }
}
