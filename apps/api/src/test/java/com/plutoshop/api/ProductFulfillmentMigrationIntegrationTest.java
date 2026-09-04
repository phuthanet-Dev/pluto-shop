package com.plutoshop.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class ProductFulfillmentMigrationIntegrationTest {

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
    void migrationCreatesTypedFulfillmentTablesAndProtectsSecretColumns() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement()) {
            assertThat(tableExists(statement, "product_fulfillment_profiles")).isTrue();
            assertThat(tableExists(statement, "product_fulfillment_steps")).isTrue();
            assertThat(tableExists(statement, "digital_inventory_items")).isTrue();
            assertThat(tableExists(statement, "order_fulfillments")).isTrue();
            assertThat(tableExists(statement, "order_fulfillment_allocations")).isTrue();
            assertThat(tableExists(statement, "fulfillment_audit_log")).isTrue();

            assertThat(columnExists(statement, "digital_inventory_items", "email")).isFalse();
            assertThat(columnExists(statement, "digital_inventory_items", "password")).isFalse();
            assertThat(columnExists(statement, "digital_inventory_items", "license_key")).isFalse();
            assertThat(columnExists(statement, "digital_inventory_items", "invite_url")).isFalse();
            assertThat(columnExists(statement, "digital_inventory_items", "secret_ciphertext")).isTrue();
            assertThat(columnExists(statement, "digital_inventory_items", "secret_nonce")).isTrue();
            assertThat(columnExists(statement, "digital_inventory_items", "encryption_key_version")).isTrue();
            assertThat(columnExists(statement, "order_fulfillments", "next_attempt_at")).isTrue();
        }
    }

    @Test
    void migrationCreatesTypedConstraintsAndRuntimeGrants() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement()) {
            assertThat(constraintExists(statement, "digital_inventory_items", "digital_inventory_items_type_check")).isTrue();
            assertThat(constraintExists(statement, "digital_inventory_items", "digital_inventory_items_status_check")).isTrue();
            assertThat(constraintExists(statement, "product_fulfillment_steps", "product_fulfillment_steps_order_uq")).isTrue();
            assertThat(constraintExists(statement, "order_fulfillment_allocations", "order_fulfillment_allocations_inventory_uq")).isFalse();
            assertThat(indexExists(statement, "order_fulfillment_allocations_active_inventory_uq")).isTrue();
            assertThat(constraintExists(statement, "product_fulfillment_profiles", "product_fulfillment_profiles_identity_uq")).isTrue();
            assertThat(tablePrivilege(statement, "digital_inventory_items", "pluto_user", "SELECT")).isTrue();
            assertThat(tablePrivilege(statement, "digital_inventory_items", "pluto_user", "UPDATE")).isFalse();
            assertThat(columnPrivilege(statement, "digital_inventory_items", "pluto_user", "status", "UPDATE")).isTrue();
            assertThat(tablePrivilege(statement, "order_fulfillments", "pluto_user", "UPDATE")).isFalse();
            assertThat(columnPrivilege(statement, "order_fulfillments", "pluto_user", "status", "UPDATE")).isTrue();
            assertThat(tablePrivilege(statement, "order_fulfillment_allocations", "pluto_user", "UPDATE")).isFalse();
            assertThat(columnPrivilege(statement, "order_fulfillment_allocations", "pluto_user", "status", "UPDATE")).isTrue();
            assertThat(tablePrivilege(statement, "fulfillment_audit_log", "pluto_user", "INSERT")).isFalse();
            assertThat(columnPrivilege(statement, "digital_inventory_items", "pluto_user", "secret_ciphertext", "UPDATE")).isFalse();
            assertThat(tablePrivilege(statement, "digital_inventory_items", "pluto_inspector", "SELECT")).isFalse();
            assertThat(tablePrivilege(statement, "product_fulfillment_profiles", "pluto_admin", "UPDATE")).isTrue();
        }
    }

    private static void migrate() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate();
    }

    private static boolean tableExists(Statement statement, String tableName) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = '%s'
                )
                """.formatted(tableName))) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean columnExists(Statement statement, String tableName, String columnName) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_schema = 'public'
                      AND table_name = '%s'
                      AND column_name = '%s'
                )
                """.formatted(tableName, columnName))) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean constraintExists(Statement statement, String tableName, String constraintName) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT EXISTS (
                    SELECT 1
                    FROM information_schema.table_constraints
                    WHERE table_schema = 'public'
                      AND table_name = '%s'
                      AND constraint_name = '%s'
                )
                """.formatted(tableName, constraintName))) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean tablePrivilege(
            Statement statement,
            String tableName,
            String grantee,
            String privilege) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT has_table_privilege('%s', '%s', '%s')
                """.formatted(grantee, tableName, privilege))) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean columnPrivilege(
            Statement statement,
            String tableName,
            String grantee,
            String columnName,
            String privilege) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT has_column_privilege('%s', '%s', '%s', '%s')
                """.formatted(grantee, tableName, columnName, privilege))) {
            return result.next() && result.getBoolean(1);
        }
    }

    private static boolean indexExists(Statement statement, String indexName) throws Exception {
        try (ResultSet result = statement.executeQuery("""
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_indexes
                    WHERE schemaname = 'public' AND indexname = '%s'
                )
                """.formatted(indexName))) {
            return result.next() && result.getBoolean(1);
        }
    }
}
