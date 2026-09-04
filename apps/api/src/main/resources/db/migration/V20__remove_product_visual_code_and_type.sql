ALTER TABLE products
    DROP CONSTRAINT IF EXISTS products_bundle_item_count_check;

ALTER TABLE products
    DROP COLUMN visual_code,
    DROP COLUMN type;

ALTER TABLE products
    ADD CONSTRAINT products_bundle_item_count_check
        CHECK (bundle_item_count IS NULL OR bundle_item_count >= 2);

COMMENT ON COLUMN products.bundle_item_count IS
    'จำนวนรายการในชุด; NULL คือสินค้าเดี่ยว และค่าตั้งแต่ 2 คือสินค้าแบบชุด';
