ALTER TABLE products
    ADD COLUMN short_description_th VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN short_description_en VARCHAR(500) NOT NULL DEFAULT '',
    ADD COLUMN delivery_type VARCHAR(16) NOT NULL DEFAULT 'INSTANT',
    ADD COLUMN warranty_days INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN stock_warning_threshold INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 1;

UPDATE products
SET short_description_th = LEFT(description_th, 500),
    short_description_en = LEFT(description_en, 500),
    delivery_type = CASE WHEN instant_delivery THEN 'INSTANT' ELSE 'MANUAL' END,
    status = CASE WHEN active THEN 'ACTIVE' ELSE 'INACTIVE' END,
    sort_order = catalog_order;

ALTER TABLE products
    ADD CONSTRAINT products_delivery_type_check
        CHECK (delivery_type IN ('INSTANT', 'MANUAL')),
    ADD CONSTRAINT products_warranty_days_check
        CHECK (warranty_days >= 0),
    ADD CONSTRAINT products_stock_warning_threshold_check
        CHECK (stock_warning_threshold >= 0),
    ADD CONSTRAINT products_status_check
        CHECK (status IN ('ACTIVE', 'INACTIVE', 'HIDDEN')),
    ADD CONSTRAINT products_sort_order_check
        CHECK (sort_order > 0);

CREATE INDEX products_status_sort_order_idx
    ON products (status, sort_order, id);

COMMENT ON COLUMN products.short_description_th IS
    'คำโปรยสั้นภาษาไทยสำหรับแสดงบนการ์ดสินค้า';
COMMENT ON COLUMN products.short_description_en IS
    'Short product summary for the public product card';
COMMENT ON COLUMN products.delivery_type IS
    'รูปแบบการส่งมอบสินค้า: INSTANT หรือ MANUAL';
COMMENT ON COLUMN products.warranty_days IS
    'จำนวนวันรับประกันสินค้า; ศูนย์หมายถึงไม่มีการรับประกัน';
COMMENT ON COLUMN products.stock_warning_threshold IS
    'จำนวน stock ที่ใช้แสดงคำเตือนสินค้าใกล้หมดในหน้าจัดการ';
COMMENT ON COLUMN products.status IS
    'สถานะการแสดงผลสินค้า: ACTIVE, INACTIVE หรือ HIDDEN';
COMMENT ON COLUMN products.sort_order IS
    'ลำดับแสดงสินค้าใหม่; ค่าเดิมถูก backfill จาก catalog_order';
