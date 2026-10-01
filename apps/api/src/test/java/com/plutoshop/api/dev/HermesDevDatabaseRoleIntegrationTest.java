package com.plutoshop.api.dev;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.MountableFile;

@Testcontainers
class HermesDevDatabaseRoleIntegrationTest {

    private static final String APPLICATION_DATABASE = "plutoshop_dev";
    private static final String KEYCLOAK_DATABASE = "keycloak_dev";
    private static final String OPERATOR_ROLE = "hermes_dev_operator";
    private static final String OPERATOR_PASSWORD = "operator-test-password";
    private static final String KEYCLOAK_PASSWORD = "keycloak-test-password";

    @Container
    private static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer("postgres:18.6-alpine")
            .withDatabaseName(APPLICATION_DATABASE)
            .withUsername("pluto")
            .withPassword("owner-test-password");

    @BeforeAll
    static void prepareDisposableDatabaseAndRunBootstrap() throws Exception {
        try (Connection owner = POSTGRES.createConnection("");
                Statement statement = owner.createStatement()) {
            statement.execute("CREATE ROLE keycloak LOGIN PASSWORD '" + KEYCLOAK_PASSWORD + "'");
            statement.execute("CREATE DATABASE " + KEYCLOAK_DATABASE + " OWNER keycloak");
            statement.execute("GRANT CONNECT, TEMPORARY ON DATABASE " + KEYCLOAK_DATABASE + " TO PUBLIC");
            statement.execute("GRANT CREATE ON SCHEMA public TO PUBLIC");
            for (String table : new String[] {
                "products", "carts", "payment_transactions", "digital_inventory_items",
                "flyway_schema_history"
            }) {
                statement.execute("CREATE TABLE " + table
                        + " (id BIGSERIAL PRIMARY KEY, payload TEXT NOT NULL DEFAULT 'fixture')");
            }
        }

        Path repositoryRoot = Path.of("..", "..").toAbsolutePath().normalize();
        POSTGRES.copyFileToContainer(
                MountableFile.forHostPath(devBootstrapFile(repositoryRoot, "bootstrap-hermes-db-role.sh")),
                "/tmp/bootstrap-hermes-db-role.sh");
        POSTGRES.copyFileToContainer(
                MountableFile.forHostPath(devBootstrapFile(repositoryRoot, "hermes-db-role-bootstrap.sql")),
                "/tmp/hermes-db-role-bootstrap.sql");

        String bootstrap = """
                export POSTGRES_HOST=127.0.0.1
                export POSTGRES_DB=plutoshop_dev
                export POSTGRES_USER=pluto
                export POSTGRES_OWNER_PASSWORD=owner-test-password
                export POSTGRES_HERMES_PASSWORD=operator-test-password
                export KEYCLOAK_DB_NAME=keycloak_dev
                export KEYCLOAK_DB_USER=keycloak
                exec bash /tmp/bootstrap-hermes-db-role.sh /tmp/hermes-db-role-bootstrap.sql
                """;
        var result = POSTGRES.execInContainer("bash", "-ec", bootstrap);
        assertThat(result.getExitCode())
                .withFailMessage("Hermes DB role bootstrap failed without showing fixture credentials: %s", result.getStderr())
                .isZero();
        assertThat(result.getStdout()).doesNotContain(OPERATOR_PASSWORD, KEYCLOAK_PASSWORD);
        assertThat(result.getStderr()).doesNotContain(OPERATOR_PASSWORD, KEYCLOAK_PASSWORD);
    }

    @Test
    void operatorCanModifyExistingApplicationTables() throws Exception {
        try (Connection operator = operatorConnection(); Statement statement = operator.createStatement()) {
            for (String table : new String[] {
                "products", "carts", "payment_transactions", "digital_inventory_items"
            }) {
                statement.executeUpdate("INSERT INTO " + table + " (payload) VALUES ('before')");
                statement.executeUpdate("UPDATE " + table + " SET payload = 'after' WHERE payload = 'before'");
                statement.executeUpdate("DELETE FROM " + table + " WHERE payload = 'after'");
            }
            try (ResultSet sequence = statement.executeQuery("SELECT nextval('products_id_seq')")) {
                assertThat(sequence.next()).isTrue();
                assertThat(sequence.getLong(1)).isPositive();
            }
        }
    }

    @Test
    void operatorCanModifyFutureMigrationOwnedTables() throws Exception {
        try (Connection owner = POSTGRES.createConnection(""); Statement statement = owner.createStatement()) {
            statement.execute("CREATE TABLE future_shop_table "
                    + "(id BIGSERIAL PRIMARY KEY, payload TEXT NOT NULL)");
        }

        try (Connection operator = operatorConnection(); Statement statement = operator.createStatement()) {
            statement.executeUpdate("INSERT INTO future_shop_table (payload) VALUES ('future')");
            statement.executeUpdate("UPDATE future_shop_table SET payload = 'updated'");
            statement.executeUpdate("DELETE FROM future_shop_table");
            try (ResultSet sequence = statement.executeQuery("SELECT nextval('future_shop_table_id_seq')")) {
                assertThat(sequence.next()).isTrue();
            }
        }
    }

    @Test
    void operatorCannotWriteMigrationHistory() throws Exception {
        try (Connection operator = operatorConnection(); Statement statement = operator.createStatement()) {
            assertThatThrownBy(() -> statement.executeUpdate(
                    "UPDATE flyway_schema_history SET payload = 'tampered'"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("permission denied");
        }
    }

    @Test
    void operatorCannotCreateSchemaObjects() throws Exception {
        try (Connection operator = operatorConnection(); Statement statement = operator.createStatement()) {
            assertThatThrownBy(() -> statement.execute(
                    "CREATE TABLE forbidden_schema_change (id INTEGER)"))
                    .isInstanceOf(SQLException.class)
                    .hasMessageContaining("permission denied");
        }
    }

    @Test
    void operatorCannotConnectToKeycloakDatabase() {
        String keycloakUrl = POSTGRES.getJdbcUrl().replace("/" + APPLICATION_DATABASE, "/" + KEYCLOAK_DATABASE);
        assertThatThrownBy(() -> DriverManager.getConnection(keycloakUrl, OPERATOR_ROLE, OPERATOR_PASSWORD))
                .isInstanceOf(SQLException.class);
    }

    @Test
    void keycloakServiceCanStillConnectAfterPublicAccessIsRevoked() throws Exception {
        String keycloakUrl = POSTGRES.getJdbcUrl().replace("/" + APPLICATION_DATABASE, "/" + KEYCLOAK_DATABASE);
        try (Connection keycloak = DriverManager.getConnection(keycloakUrl, "keycloak", KEYCLOAK_PASSWORD);
                Statement statement = keycloak.createStatement();
                ResultSet result = statement.executeQuery("SELECT current_database()")) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString(1)).isEqualTo(KEYCLOAK_DATABASE);
        }
    }

    private static Connection operatorConnection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), OPERATOR_ROLE, OPERATOR_PASSWORD);
    }

    private static Path devBootstrapFile(Path repositoryRoot, String filename) {
        Path mountedSource = Path.of("/tmp", filename);
        if (Files.isRegularFile(mountedSource)) {
            return mountedSource;
        }
        return repositoryRoot.resolve("infra/dev").resolve(filename);
    }
}
