package com.plutoshop.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigInteger;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class ProductReadOnlyRoleMigrationIntegrationTest {

    private static final String APP_ROLE = "pluto_app";
    private static final String APP_PASSWORD = new BigInteger(160, new SecureRandom()).toString(32);

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @BeforeAll
    static void createRuntimeRoleAndMigrate() throws Exception {
        try (Connection owner = POSTGRES.createConnection("");
                Statement statement = owner.createStatement()) {
            statement.execute("CREATE ROLE " + APP_ROLE + " LOGIN PASSWORD '" + APP_PASSWORD + "'");
        }

        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate();
    }

    @Test
    void migrationGrantsReadAccessOnlyToTheCatalogTable() throws Exception {
        try (Connection owner = POSTGRES.createConnection("");
                Statement statement = owner.createStatement()) {
            statement.execute("CREATE TABLE future_product_views (id INTEGER PRIMARY KEY)");
            statement.execute("INSERT INTO future_product_views (id) VALUES (1)");
        }

        try (Connection runtime = DriverManager.getConnection(
                        POSTGRES.getJdbcUrl(), APP_ROLE, APP_PASSWORD);
                Statement statement = runtime.createStatement()) {
            try (ResultSet products = statement.executeQuery("SELECT count(*) FROM products")) {
                assertThat(products.next()).isTrue();
                assertThat(products.getInt(1)).isEqualTo(36);
            }
            try (ResultSet groups = statement.executeQuery("SELECT count(*) FROM product_option_groups")) {
                assertThat(groups.next()).isTrue();
                assertThat(groups.getInt(1)).isZero();
            }
            assertThatThrownBy(() -> statement.executeQuery("SELECT count(*) FROM future_product_views"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("permission denied");

            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO products (
                        slug, name_th, name_en, description_th, description_en,
                        selection_mode, price_minor, currency, stock_quantity,
                        instant_delivery, catalog_order, active,
                        delivery_type, status, sort_order
                    ) VALUES (
                        'forbidden-write', 'ห้ามเขียน', 'Forbidden write', 'ห้ามเขียน',
                        'Must fail', 'SINGLE_OPTION', 0, 'THB', 0,
                        TRUE, 99, TRUE, 'INSTANT', 'ACTIVE', 99
                    )
                    """))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("permission denied");
        }
    }
}
