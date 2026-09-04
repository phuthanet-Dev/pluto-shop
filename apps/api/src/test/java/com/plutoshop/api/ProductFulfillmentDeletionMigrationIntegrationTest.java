package com.plutoshop.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Types;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class ProductFulfillmentDeletionMigrationIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @BeforeAll
    static void createApplicationRoles() throws Exception {
        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement()) {
            statement.execute("CREATE ROLE pluto_user NOLOGIN");
            statement.execute("CREATE ROLE pluto_admin NOLOGIN");
            statement.execute("CREATE ROLE pluto_inspector NOLOGIN");
        }
    }

    @Test
    void hardDeleteReturnsConflictWhenProductHasFulfillmentProfile() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                PreparedStatement insertProduct = connection.prepareStatement("""
                        INSERT INTO products (
                            slug, name_th, name_en, short_description_th, short_description_en,
                            description_th, description_en, price_minor, currency, stock_quantity,
                            instant_delivery, catalog_order, delivery_type, warranty_days,
                            stock_warning_threshold, status, sort_order
                        ) VALUES (
                            'fulfillment-delete-test', 'ทดสอบลบ', 'Delete test', 'สั้น', 'Short',
                            'รายละเอียด', 'Description', 100, 'THB', 0,
                            TRUE, 9101, 'INSTANT', 0, 0, 'ACTIVE', 9101
                        ) RETURNING id
                        """);
                Statement statement = connection.createStatement()) {
            ResultSet productResult = insertProduct.executeQuery();
            assertThat(productResult.next()).isTrue();
            long productId = productResult.getLong(1);

            try (PreparedStatement insertProfile = connection.prepareStatement("""
                    INSERT INTO product_fulfillment_profiles (
                        product_id, fulfillment_type, provider, payload_schema_version
                    ) VALUES (?, 'LICENSE_KEY', 'SYNTHETIC', 1)
                    """)) {
                insertProfile.setLong(1, productId);
                insertProfile.executeUpdate();
            }

            try (PreparedStatement delete = connection.prepareStatement("""
                    SELECT delete_product_and_carts(?, 0, 'synthetic-issuer', 'synthetic-admin')
                    """)) {
                delete.setLong(1, productId);
                ResultSet deleteResult = delete.executeQuery();
                assertThat(deleteResult.next()).isTrue();
                assertThat(deleteResult.getString(1)).isEqualTo("FULFILLMENT_CONFLICT");
            }

            assertThat(productExists(statement, productId)).isTrue();
        }
    }

    @Test
    void hardDeleteRejectsNullVersionBeforeRemovingCartItems() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                PreparedStatement insertProduct = connection.prepareStatement("""
                        INSERT INTO products (
                            slug, name_th, name_en, short_description_th, short_description_en,
                            description_th, description_en, price_minor, currency, stock_quantity,
                            instant_delivery, catalog_order, delivery_type, warranty_days,
                            stock_warning_threshold, status, sort_order
                        ) VALUES (
                            'fulfillment-delete-null-version-test', 'ทดสอบลบ', 'Delete test', 'สั้น', 'Short',
                            'รายละเอียด', 'Description', 100, 'THB', 0,
                            TRUE, 9102, 'INSTANT', 0, 0, 'ACTIVE', 9102
                        ) RETURNING id
                        """);
                Statement statement = connection.createStatement()) {
            ResultSet productResult = insertProduct.executeQuery();
            assertThat(productResult.next()).isTrue();
            long productId = productResult.getLong(1);

            long userId;
            try (PreparedStatement insertUser = connection.prepareStatement("""
                    INSERT INTO app_users (issuer, subject, email, display_name)
                    VALUES ('https://issuer.example/realms/pluto', 'delete-null-version-user',
                            'delete-null-version-user@example.invalid', 'Delete test')
                    RETURNING id
                    """)) {
                ResultSet userResult = insertUser.executeQuery();
                assertThat(userResult.next()).isTrue();
                userId = userResult.getLong(1);
            }

            long cartId;
            try (PreparedStatement insertCart = connection.prepareStatement("""
                    INSERT INTO carts (user_id, status) VALUES (?, 'ACTIVE') RETURNING id
                    """)) {
                insertCart.setLong(1, userId);
                ResultSet cartResult = insertCart.executeQuery();
                assertThat(cartResult.next()).isTrue();
                cartId = cartResult.getLong(1);
            }

            try (PreparedStatement insertCartItem = connection.prepareStatement("""
                    INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, 1)
                    """)) {
                insertCartItem.setLong(1, cartId);
                insertCartItem.setLong(2, productId);
                insertCartItem.executeUpdate();
            }

            try (PreparedStatement delete = connection.prepareStatement("""
                    SELECT delete_product_and_carts(?, ?, 'synthetic-issuer', 'synthetic-admin')
                    """)) {
                delete.setLong(1, productId);
                delete.setNull(2, Types.BIGINT);
                ResultSet deleteResult = delete.executeQuery();
                assertThat(deleteResult.next()).isTrue();
                assertThat(deleteResult.getString(1)).isEqualTo("INVALID_ARGUMENT");
            }

            assertThat(productExists(statement, productId)).isTrue();
            assertThat(cartItemCount(statement, productId)).isEqualTo(1);
        }
    }

    private static boolean productExists(Statement statement, long productId) throws Exception {
        try (PreparedStatement query = statement.getConnection().prepareStatement(
                "SELECT EXISTS (SELECT 1 FROM products WHERE id = ?)");) {
            query.setLong(1, productId);
            try (ResultSet result = query.executeQuery()) {
                return result.next() && result.getBoolean(1);
            }
        }
    }

    private static int cartItemCount(Statement statement, long productId) throws Exception {
        try (PreparedStatement query = statement.getConnection().prepareStatement(
                "SELECT count(*) FROM cart_items WHERE product_id = ?")) {
            query.setLong(1, productId);
            try (ResultSet result = query.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getInt(1);
            }
        }
    }

    private static void migrate() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate();
    }
}
