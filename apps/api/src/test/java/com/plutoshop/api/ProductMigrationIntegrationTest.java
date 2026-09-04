package com.plutoshop.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;

@Testcontainers
class ProductMigrationIntegrationTest {

    @Container
    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer("postgres:18.6-alpine");

    @Test
    void migrationCreatesProductsTable() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select exists (
                            select 1
                            from information_schema.tables
                            where table_schema = 'public'
                              and table_name = 'products'
                        )
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getBoolean(1)).isTrue();
        }
    }

    @Test
    void migrationCreatesSharedMultiOptionGroupMetadataTable() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select exists (
                            select 1
                            from information_schema.tables
                            where table_schema = 'public'
                              and table_name = 'product_option_groups'
                        )
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getBoolean(1)).isTrue();
        }
    }

    @Test
    void migrationCreatesPaymentTables() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select count(*)
                        from information_schema.tables
                        where table_schema = 'public'
                          and table_name in ('shop_orders', 'shop_order_items', 'payment_transactions')
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isEqualTo(3);
        }
    }

    @Test
    void migrationSeedsExactlyThirtySixProductsInOriginalCatalogOrder() throws Exception {
        migrate();

        List<SeedRow> products = new ArrayList<>();
        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select slug, name_th, name_en, description_th, description_en,
                               price_minor, stock_quantity,
                               instant_delivery, catalog_order
                        from products
                        order by catalog_order
                        """)) {
            while (result.next()) {
                products.add(new SeedRow(
                        result.getString("slug"),
                        result.getString("name_th"),
                        result.getString("name_en"),
                        result.getString("description_th"),
                        result.getString("description_en"),
                        result.getInt("price_minor"),
                        result.getInt("stock_quantity"),
                        result.getBoolean("instant_delivery"),
                        result.getInt("catalog_order")));
            }
        }

        assertThat(products).hasSize(36);
        assertThat(products).extracting(SeedRow::catalogOrder)
                .containsExactlyElementsOf(java.util.stream.IntStream.rangeClosed(1, 36).boxed().toList());
        assertThat(products).extracting(SeedRow::slug).doesNotHaveDuplicates();
        assertThat(products).allSatisfy(product -> {
            assertThat(product.nameTh()).isNotBlank();
            assertThat(product.descriptionTh()).isNotBlank();
            assertThat(product.descriptionEn()).isNotBlank();
        });
        assertThat(products).extracting(SeedRow::nameEn).containsExactly(
                "Creator Launch Kit", "Aurora UI Component Library",
                "Social Post Template Collection", "Minimal Brand Guidelines",
                "Editorial Presentation Deck", "Invoice & Quote Template Bundle",
                "Freelance Project Starter Pack", "Podcast Cover Art Templates",
                "Motion Title Graphics Pack", "Cinematic Color Presets",
                "Abstract 3D Shapes Collection", "Essential Interface Icon Set",
                "Modern Resume & Portfolio Kit", "Daily Focus Planner",
                "Travel Journal Page Bundle", "Recipe Book Layout Template",
                "Personal Budget Spreadsheet", "Small Business Finance Dashboard",
                "Project Planning Workspace", "Online Course Workbook",
                "Website Wireframe Library", "Email Campaign Template Set",
                "Video Thumbnail Design Pack", "Sound Effects Starter Library",
                "Ambient Audio Loop Collection", "Lifestyle Stock Photo Bundle",
                "Handwritten Font Pair", "Editorial Serif Display Font",
                "Monoline Illustration Kit", "Gradient Background Collection",
                "E-commerce Product Mockups", "Packaging Mockup Essentials",
                "Mobile App Showcase Scenes", "Creative Business Card Pack",
                "Newsletter Layout System", "Digital Product Launch Checklist");
        List<Integer> referenceUsd = List.of(
                29, 34, 18, 24, 16, 9, 14, 12, 28, 19, 22, 15,
                13, 7, 8, 18, 11, 27, 21, 17, 32, 14, 12, 23,
                16, 36, 19, 25, 20, 10, 31, 26, 24, 9, 18, 6);
        assertThat(products).extracting(SeedRow::priceMinor)
                .containsExactlyElementsOf(referenceUsd.stream().map(usd -> usd * 35 * 100).toList());
        assertThat(products).extracting(SeedRow::stockQuantity).containsExactly(
                1, 88, 1, 70, 1, 200, 1, 82, 1, 140, 1, 180,
                1, 230, 1, 76, 210, 1, 99, 1, 49, 1, 160, 1,
                58, 1, 125, 1, 77, 1, 52, 1, 80, 1, 90, 240);
        assertThat(products).allMatch(SeedRow::instantDelivery);
        assertThat(products.get(0).slug()).isEqualTo("creator-launch-kit");
        assertThat(products.get(0).priceMinor()).isEqualTo(101_500);
        assertThat(products.get(24).slug()).isEqualTo("ambient-audio-loop-collection");
        assertThat(products.get(24).priceMinor()).isEqualTo(56_000);
        assertThat(products.get(35).slug()).isEqualTo("digital-product-launch-checklist");
        assertThat(products.get(35).priceMinor()).isEqualTo(21_000);

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select count(*)
                        from products
                        where selection_mode = 'SINGLE_OPTION'
                          and option_group is null
                          and option_label_th is null
                          and option_label_en is null
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isEqualTo(36);
        }
    }

    @Test
    void migrationBackfillsProductMetadataAndLegacyInvariants() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select short_description_th, short_description_en, delivery_type,
                               warranty_days, stock_warning_threshold, status, sort_order, catalog_order
                        from products
                        where id = 1
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getString("short_description_th")).isNotBlank();
            assertThat(result.getString("short_description_en")).isNotBlank();
            assertThat(result.getString("short_description_th").length()).isLessThanOrEqualTo(500);
            assertThat(result.getString("short_description_en").length()).isLessThanOrEqualTo(500);
            assertThat(result.getString("delivery_type")).isEqualTo("INSTANT");
            assertThat(result.getInt("warranty_days")).isZero();
            assertThat(result.getInt("stock_warning_threshold")).isEqualTo(5);
            assertThat(result.getString("status")).isEqualTo("ACTIVE");
            assertThat(result.getInt("sort_order")).isEqualTo(1);
            assertThat(result.getInt("catalog_order")).isEqualTo(1);
        }

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select count(*)
                        from products
                        where instant_delivery = (delivery_type = 'INSTANT')
                          and active = (status = 'ACTIVE')
                          and catalog_order = sort_order
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isEqualTo(36);
        }
    }

    @Test
    void migrationRemovesVisualCodeAndTypeColumnsFromProducts() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select count(*)
                        from information_schema.columns
                        where table_schema = 'public'
                          and table_name = 'products'
                          and column_name in ('visual_code', 'type')
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isZero();
        }
    }

    @Test
    void migrationRemovesBundleItemCountColumnFromProducts() throws Exception {
        migrate();

        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select count(*)
                        from information_schema.columns
                        where table_schema = 'public'
                          and table_name = 'products'
                          and column_name = 'bundle_item_count'
                        """)) {
            assertThat(result.next()).isTrue();
            assertThat(result.getInt(1)).isZero();
        }
    }

    private void migrate() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate();
    }

    private record SeedRow(
            String slug,
            String nameTh,
            String nameEn,
            String descriptionTh,
            String descriptionEn,
            int priceMinor,
            int stockQuantity,
            boolean instantDelivery,
            int catalogOrder) {
    }
}
