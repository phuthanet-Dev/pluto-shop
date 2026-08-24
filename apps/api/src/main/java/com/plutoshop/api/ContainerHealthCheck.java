package com.plutoshop.api;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

public final class ContainerHealthCheck {

    private static final Duration TIMEOUT = Duration.ofSeconds(3);

    private ContainerHealthCheck() {
    }

    public static void main(String[] args) {
        String port = System.getenv().getOrDefault("SERVER_PORT", "8080");
        boolean healthy;
        try {
            healthy = isHealthy(URI.create("http://127.0.0.1:" + port + "/actuator/health"));
        } catch (IllegalArgumentException exception) {
            healthy = false;
        }
        if (!healthy) {
            System.exit(1);
        }
    }

    static boolean isHealthy(URI uri) {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(TIMEOUT)
                .build();
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(TIMEOUT)
                .GET()
                .build();
        try {
            HttpResponse<Void> response = client.send(
                    request, HttpResponse.BodyHandlers.discarding());
            return response.statusCode() >= 200 && response.statusCode() < 300;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        } catch (IOException exception) {
            return false;
        }
    }
}
