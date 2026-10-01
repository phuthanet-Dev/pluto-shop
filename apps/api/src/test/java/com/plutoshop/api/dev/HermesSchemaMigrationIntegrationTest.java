package com.plutoshop.api.dev;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class HermesSchemaMigrationIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @BeforeEach
    void resetDisposableSchema() throws Exception {
        try (Connection owner = POSTGRES.createConnection("");
                Statement statement = owner.createStatement()) {
            statement.execute("DROP SCHEMA public CASCADE");
            statement.execute("CREATE SCHEMA public");
        }
    }

    @Test
    void additiveMigrationKeepsLegacyColumnAvailable() throws Exception {
        migrateTo("1");
        insertLegacyRow(1, "old-value");

        migrateTo("2");

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet row = statement.executeQuery(
                        "SELECT legacy_value, replacement_value FROM schema_probe WHERE id = 1")) {
            assertThat(row.next()).isTrue();
            assertThat(row.getString("legacy_value")).isEqualTo("old-value");
            assertThat(row.getString("replacement_value")).isEqualTo("old-value");
        }

        insertLegacyRow(2, "still-works");
        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet row = statement.executeQuery(
                        "SELECT replacement_value FROM schema_probe WHERE id = 2")) {
            assertThat(row.next()).isTrue();
            assertThat(row.getString(1)).isNull();
        }
    }

    @Test
    void contractMigrationRunsOnlyAfterExpandMigration() throws Exception {
        migrateTo("1");
        insertLegacyRow(1, "preserved-value");
        migrateTo("2");
        migrateTo("3");

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet row = statement.executeQuery(
                        "SELECT replacement_value FROM schema_probe WHERE id = 1")) {
            assertThat(row.next()).isTrue();
            assertThat(row.getString(1)).isEqualTo("preserved-value");
        }

        try (Connection connection = POSTGRES.createConnection("");
                PreparedStatement statement = connection.prepareStatement("""
                        SELECT count(*) FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'schema_probe'
                          AND column_name = 'legacy_value'
                        """);
                ResultSet result = statement.executeQuery()) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isZero();
        }
    }

    @Test
    void versionedMigrationsCanCreateAndDropTables() throws Exception {
        migrateTo("2");
        assertThat(tableExists("schema_probe_related")).isTrue();

        migrateTo("4");

        assertThat(tableExists("schema_probe_related")).isFalse();
        assertThat(tableExists("schema_probe")).isTrue();
    }

    @Test
    void migrationFixturesStayOutOfRuntimeResources() {
        Path testResources = Path.of("src/test/resources/db/migration/hermes-schema-test");
        Path runtimeResources = Path.of("src/main/resources/db/migration/hermes-schema-test");

        assertThat(Files.exists(testResources.resolve("V1__create_probe_table.sql"))).isTrue();
        assertThat(Files.exists(testResources.resolve("V2__expand_probe_table.sql"))).isTrue();
        assertThat(Files.exists(testResources.resolve("V3__contract_probe_table.sql"))).isTrue();
        assertThat(Files.exists(testResources.resolve("V4__drop_related_probe_table.sql"))).isTrue();
        assertThat(Files.exists(runtimeResources)).isFalse();
    }

    private static void migrateTo(String version) {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration/hermes-schema-test")
                .target(MigrationVersion.fromVersion(version))
                .load()
                .migrate();
    }

    private static void insertLegacyRow(long id, String value) throws Exception {
        try (Connection connection = POSTGRES.createConnection("");
                PreparedStatement statement = connection.prepareStatement(
                        "INSERT INTO schema_probe (id, legacy_value) VALUES (?, ?)")) {
            statement.setLong(1, id);
            statement.setString(2, value);
            statement.executeUpdate();
        }
    }

    private static boolean tableExists(String name) throws Exception {
        try (Connection connection = POSTGRES.createConnection("");
                PreparedStatement statement = connection.prepareStatement("SELECT to_regclass(?) IS NOT NULL")) {
            statement.setString(1, "public." + name);
            try (ResultSet result = statement.executeQuery()) {
                assertThat(result.next()).isTrue();
                return result.getBoolean(1);
            }
        }
    }
}