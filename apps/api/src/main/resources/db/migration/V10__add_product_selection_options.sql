ALTER TABLE products
    ADD COLUMN selection_mode VARCHAR(16) NOT NULL DEFAULT 'SINGLE_OPTION',
    ADD COLUMN option_group VARCHAR(120),
    ADD COLUMN option_label_th VARCHAR(180),
    ADD COLUMN option_label_en VARCHAR(180);

ALTER TABLE products
    ADD CONSTRAINT products_selection_mode_check CHECK (
        (selection_mode = 'SINGLE_OPTION'
            AND option_group IS NULL
            AND option_label_th IS NULL
            AND option_label_en IS NULL)
        OR (selection_mode = 'MULTI_OPTION'
            AND option_group IS NOT NULL
            AND option_group ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
            AND option_label_th IS NOT NULL
            AND length(trim(option_label_th)) > 0
            AND option_label_en IS NOT NULL
            AND length(trim(option_label_en)) > 0)
    );

CREATE INDEX products_selection_group_idx
    ON products (selection_mode, option_group, catalog_order);
