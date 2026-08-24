package com.plutoshop.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.InetSocketAddress;
import java.net.URI;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

class ContainerHealthCheckTest {

    @Test
    void healthCheckAcceptsSuccessAndRejectsUnavailableResponses() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/up", exchange -> {
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.createContext("/down", exchange -> {
            exchange.sendResponseHeaders(503, -1);
            exchange.close();
        });
        server.start();

        try {
            int port = server.getAddress().getPort();
            assertThat(ContainerHealthCheck.isHealthy(
                    URI.create("http://127.0.0.1:" + port + "/up"))).isTrue();
            assertThat(ContainerHealthCheck.isHealthy(
                    URI.create("http://127.0.0.1:" + port + "/down"))).isFalse();
        } finally {
            server.stop(0);
        }
    }
}
