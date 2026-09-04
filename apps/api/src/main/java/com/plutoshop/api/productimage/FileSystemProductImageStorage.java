package com.plutoshop.api.productimage;

import java.awt.image.BufferedImage;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class FileSystemProductImageStorage implements ProductImageStorage {

    public static final long DEFAULT_MAX_BYTES = 5L * 1024L * 1024L;
    public static final int DEFAULT_MAX_DIMENSION = 4_096;
    public static final long DEFAULT_MAX_PIXELS = 16_777_216L;

    private static final Pattern IMAGE_KEY_PATTERN = Pattern.compile(
            "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of("image/jpeg", "image/png");
    private static final byte[] JPEG_MAGIC = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};
    private static final byte[] PNG_MAGIC = {
            (byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};

    private final Path root;
    private final long maxBytes;
    private final int maxDimension;
    private final long maxPixels;

    @Autowired
    public FileSystemProductImageStorage(
            @Value("${product-media.root:/var/lib/plutoshop/product-media}") String root) {
        this(Path.of(root));
    }

    public FileSystemProductImageStorage(Path root) {
        this(root, DEFAULT_MAX_BYTES, DEFAULT_MAX_DIMENSION, DEFAULT_MAX_PIXELS);
    }

    public FileSystemProductImageStorage(Path root, long maxBytes, int maxDimension, long maxPixels) {
        if (maxBytes <= 0 || maxDimension <= 0 || maxPixels <= 0) {
            throw new IllegalArgumentException("Product image limits must be positive");
        }
        this.root = root.toAbsolutePath().normalize();
        this.maxBytes = maxBytes;
        this.maxDimension = maxDimension;
        this.maxPixels = maxPixels;
        initializeRoot();
    }

    @Override
    public ProductImageMetadata store(InputStream input, String contentTypeHint) throws IOException {
        if (input == null) {
            throw new ProductImageValidationException("Image file is required");
        }

        ensureSecureRoot();
        Path temporary = Files.createTempFile(root, ".product-image-", ".tmp");
        boolean moved = false;
        try {
            long sizeBytes;
            byte[] digest;
            try (OutputStream output = Files.newOutputStream(
                    temporary, StandardOpenOption.WRITE, StandardOpenOption.TRUNCATE_EXISTING)) {
                MessageDigest sha256 = sha256Digest();
                sizeBytes = copyWithLimit(input, output, sha256);
                digest = sha256.digest();
            }

            String contentType = detectContentType(temporary);
            validateContentTypeHint(contentTypeHint, contentType);
            Dimensions dimensions = readDimensions(temporary, contentType);
            String key = allocateKey();
            Path destination = pathForKey(key);
            moveAtomically(temporary, destination);
            moved = true;
            return new ProductImageMetadata(
                    key,
                    contentType,
                    sizeBytes,
                    dimensions.width(),
                    dimensions.height(),
                    HexFormat.of().formatHex(digest));
        } finally {
            if (!moved) {
                Files.deleteIfExists(temporary);
            }
        }
    }

    @Override
    public InputStream open(String imageKey) throws IOException {
        Path path = pathForKey(imageKey);
        if (!isRegularFileWithoutSymlink(path)) {
            throw notFound();
        }
        try {
            return Files.newInputStream(path, LinkOption.NOFOLLOW_LINKS, StandardOpenOption.READ);
        } catch (NoSuchFileException exception) {
            throw notFound();
        }
    }

    @Override
    public void delete(String imageKey) throws IOException {
        Path path = pathForKey(imageKey);
        if (Files.isSymbolicLink(path)) {
            throw new ProductImageValidationException("Product image key is invalid");
        }
        Files.deleteIfExists(path);
    }

    @Override
    public boolean exists(String imageKey) {
        Path path = pathForKey(imageKey);
        return isRegularFileWithoutSymlink(path);
    }

    private void initializeRoot() {
        try {
            createDirectoriesWithoutFollowingLinks(root);
        } catch (IOException | SecurityException exception) {
            throw new IllegalStateException("Product image storage is unavailable", exception);
        }
    }

    private static void createDirectoriesWithoutFollowingLinks(Path directory) throws IOException {
        Path absolute = directory.toAbsolutePath().normalize();
        Path current = absolute.getRoot();
        if (current == null) {
            throw new IOException("Product image storage root has no filesystem root");
        }
        for (Path component : absolute) {
            current = current.resolve(component);
            if (Files.isSymbolicLink(current)) {
                throw new IOException("Product image storage path contains a symbolic link");
            }
            if (Files.exists(current, LinkOption.NOFOLLOW_LINKS)) {
                if (!Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                    throw new IOException("Product image storage path is not a directory");
                }
                continue;
            }
            try {
                Files.createDirectory(current);
            } catch (FileAlreadyExistsException exception) {
                if (Files.isSymbolicLink(current)
                        || !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                    throw new IOException("Product image storage path is not a directory", exception);
                }
            }
        }
        verifyDirectoryTree(absolute);
    }

    private void ensureSecureRoot() {
        try {
            verifyDirectoryTree(root);
        } catch (IOException | SecurityException exception) {
            throw new ProductImageStorageException(exception);
        }
    }

    private static void verifyDirectoryTree(Path directory) throws IOException {
        Path absolute = directory.toAbsolutePath().normalize();
        Path current = absolute.getRoot();
        if (current == null) {
            throw new IOException("Product image storage root has no filesystem root");
        }
        for (Path component : absolute) {
            current = current.resolve(component);
            if (Files.isSymbolicLink(current)) {
                throw new IOException("Product image storage path contains a symbolic link");
            }
            if (Files.exists(current, LinkOption.NOFOLLOW_LINKS)
                    && !Files.isDirectory(current, LinkOption.NOFOLLOW_LINKS)) {
                throw new IOException("Product image storage path is not a directory");
            }
        }
        if (!Files.isDirectory(absolute, LinkOption.NOFOLLOW_LINKS)) {
            throw new IOException("Product image storage root is unavailable");
        }
    }

    private long copyWithLimit(InputStream input, OutputStream output, MessageDigest digest) throws IOException {
        byte[] buffer = new byte[8192];
        long total = 0;
        while (true) {
            int count = input.read(buffer);
            if (count < 0) {
                return total;
            }
            if (count == 0) {
                int single = input.read();
                if (single < 0) {
                    return total;
                }
                if (total == maxBytes) {
                    throw new ProductImageTooLargeException("Image exceeds the maximum size");
                }
                output.write(single);
                digest.update((byte) single);
                total++;
                continue;
            }
            if (count > maxBytes - total) {
                throw new ProductImageTooLargeException("Image exceeds the maximum size");
            }
            output.write(buffer, 0, count);
            digest.update(buffer, 0, count);
            total += count;
        }
    }

    private static String detectContentType(Path path) throws IOException {
        byte[] header = new byte[PNG_MAGIC.length];
        try (InputStream input = Files.newInputStream(path, StandardOpenOption.READ)) {
            int offset = 0;
            while (offset < header.length) {
                int count = input.read(header, offset, header.length - offset);
                if (count < 0) {
                    break;
                }
                if (count == 0) {
                    continue;
                }
                offset += count;
            }
            if (startsWith(header, offset, PNG_MAGIC)) {
                return "image/png";
            }
            if (offset >= JPEG_MAGIC.length && startsWith(header, offset, JPEG_MAGIC)) {
                return "image/jpeg";
            }
        }
        throw new ProductImageValidationException("Image bytes are not a supported image");
    }

    private static void validateContentTypeHint(String hint, String detectedContentType) {
        if (hint == null || hint.isBlank() || !hint.trim().toLowerCase(Locale.ROOT).startsWith("image/")) {
            return;
        }
        String normalizedHint = hint.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_CONTENT_TYPES.contains(normalizedHint)) {
            throw new ProductImageValidationException("Image type is not supported");
        }
        if (!normalizedHint.equals(detectedContentType)) {
            throw new ProductImageValidationException("Image content type does not match the image bytes");
        }
    }

    private Dimensions readDimensions(Path path, String contentType) throws IOException {
        try (ImageInputStream input = ImageIO.createImageInputStream(path.toFile())) {
            if (input == null) {
                throw new ProductImageValidationException("Image data is invalid");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            ImageReader reader = null;
            while (readers.hasNext()) {
                ImageReader candidate = readers.next();
                String format = candidate.getFormatName().toLowerCase(Locale.ROOT);
                if ((contentType.equals("image/jpeg") && format.equals("jpeg"))
                        || (contentType.equals("image/png") && format.equals("png"))) {
                    reader = candidate;
                    break;
                }
                candidate.dispose();
            }
            if (reader == null) {
                throw new ProductImageValidationException("Image data is invalid");
            }
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width > maxDimension || height > maxDimension
                        || ((long) width * height) > maxPixels) {
                    throw new ProductImageValidationException("Image dimensions are not allowed");
                }
                BufferedImage decoded = reader.read(0);
                if (decoded == null) {
                    throw new ProductImageValidationException("Image data is invalid");
                }
                return new Dimensions(width, height);
            } catch (ProductImageValidationException exception) {
                throw exception;
            } catch (IOException | RuntimeException exception) {
                throw new ProductImageValidationException("Image data is invalid");
            } finally {
                reader.dispose();
            }
        }
    }

    private String allocateKey() {
        return UUID.randomUUID().toString();
    }

    private void moveAtomically(Path source, Path destination) throws IOException {
        try {
            Files.move(source, destination, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException exception) {
            throw new IOException("Product image storage does not support atomic moves", exception);
        }
    }

    private Path pathForKey(String imageKey) {
        if (imageKey == null || !IMAGE_KEY_PATTERN.matcher(imageKey).matches()) {
            throw new ProductImageValidationException("Product image key is invalid");
        }
        ensureSecureRoot();
        Path resolved = root.resolve(imageKey).normalize();
        if (!root.equals(resolved.getParent())) {
            throw new ProductImageValidationException("Product image key is invalid");
        }
        return resolved;
    }

    private static boolean isRegularFileWithoutSymlink(Path path) {
        return !Files.isSymbolicLink(path) && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS);
    }

    private static boolean startsWith(byte[] value, int length, byte[] prefix) {
        if (length < prefix.length) {
            return false;
        }
        for (int index = 0; index < prefix.length; index++) {
            if (value[index] != prefix[index]) {
                return false;
            }
        }
        return true;
    }

    private static MessageDigest sha256Digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static FileNotFoundException notFound() {
        return new FileNotFoundException("Product image not found");
    }

    private record Dimensions(int width, int height) {
    }
}
