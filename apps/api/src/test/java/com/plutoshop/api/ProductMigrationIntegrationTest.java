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
    void migrationSeedsExactlyThirtySixProductsInOriginalCatalogOrder() throws Exception {
        migrate();

        List<SeedRow> products = new ArrayList<>();
        try (Connection connection = POSTGRES.createConnection("");
                Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("""
                        select slug, name_th, name_en, description_th, description_en,
                               visual_code, type, price_minor, stock_quantity,
                               bundle_item_count, instant_delivery, catalog_order
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
                        result.getString("visual_code"),
                        result.getString("type"),
                        result.getInt("price_minor"),
                        result.getInt("stock_quantity"),
                        result.getObject("bundle_item_count", Integer.class),
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
        assertThat(products).extracting(SeedRow::visualCode).containsExactly(
                "CL", "UI", "SP", "BG", "PD", "IQ", "FP", "PC", "MT", "CP", "3D", "IC",
                "CV", "DF", "TJ", "RB", "BS", "FD", "PW", "CW", "WW", "EM", "VT", "SF",
                "AL", "PH", "HF", "EF", "MI", "GB", "PM", "PK", "MA", "BC", "NL", "LC");
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
        assertThat(products).extracting(SeedRow::bundleItemCount).containsExactly(
                4, null, 6, null, 3, null, 5, null, 4, null, 3, null,
                4, null, 3, null, null, 2, null, 3, null, 5, null, 4,
                null, 6, null, 2, null, 8, null, 4, null, 5, null, null);
        assertThat(products).extracting(SeedRow::type).containsExactly(
                "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "BUNDLE", "SINGLE",
                "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "BUNDLE", "SINGLE",
                "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "SINGLE", "BUNDLE",
                "SINGLE", "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "BUNDLE",
                "SINGLE", "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "BUNDLE",
                "SINGLE", "BUNDLE", "SINGLE", "BUNDLE", "SINGLE", "SINGLE");
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
            String visualCode,
            String type,
            int priceMinor,
            int stockQuantity,
            Integer bundleItemCount,
            boolean instantDelivery,
            int catalogOrder) {
    }
}
