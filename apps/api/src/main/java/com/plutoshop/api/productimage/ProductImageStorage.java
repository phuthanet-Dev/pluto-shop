package com.plutoshop.api.productimage;

import java.io.IOException;
import java.io.InputStream;

public interface ProductImageStorage {

    ProductImageMetadata store(InputStream input, String contentTypeHint) throws IOException;

    InputStream open(String imageKey) throws IOException;

    void delete(String imageKey) throws IOException;

    boolean exists(String imageKey);
}
