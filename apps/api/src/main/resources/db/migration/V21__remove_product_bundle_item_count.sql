ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_bundle_item_count_check;

ALTER TABLE products
    DROP COLUMN bundle_item_count;
