CREATE TABLE product_option_groups (
    option_group VARCHAR(120) PRIMARY KEY,
    name_th VARCHAR(180) NOT NULL,
    name_en VARCHAR(180) NOT NULL,
    short_description_th VARCHAR(500) NOT NULL,
    short_description_en VARCHAR(500) NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT product_option_groups_key_not_blank
        CHECK (length(btrim(option_group)) > 0)
);

INSERT INTO product_option_groups (
    option_group,
    name_th,
    name_en,
    short_description_th,
    short_description_en,
    updated_at,
    updated_by
)
SELECT DISTINCT ON (p.option_group)
    p.option_group,
    p.name_th,
    p.name_en,
    p.short_description_th,
    p.short_description_en,
    p.updated_at,
    p.updated_by
FROM products p
WHERE p.selection_mode = 'MULTI_OPTION'
  AND p.option_group IS NOT NULL
ORDER BY p.option_group, p.sort_order, p.id;

UPDATE products p
SET name_th = g.name_th,
    name_en = g.name_en,
    short_description_th = g.short_description_th,
    short_description_en = g.short_description_en
FROM product_option_groups g
WHERE p.selection_mode = 'MULTI_OPTION'
  AND p.option_group = g.option_group;

ALTER TABLE products
    ADD CONSTRAINT products_option_group_fkey
    FOREIGN KEY (option_group) REFERENCES product_option_groups(option_group);

COMMENT ON TABLE product_option_groups IS
    'ข้อมูล card ระดับกลุ่มของสินค้า MULTI_OPTION; child ใช้ option_group ร่วมกันและยังเป็น product ที่ซื้อได้จริง';
COMMENT ON COLUMN product_option_groups.option_group IS
    'คีย์กลุ่มเสมือนที่ใช้จัดกลุ่ม child MULTI_OPTION และต้องตรงกับ products.option_group';
COMMENT ON COLUMN product_option_groups.name_th IS
    'ชื่อสินค้าไทยที่แสดงร่วมกันบน product card ของทั้งกลุ่ม';
COMMENT ON COLUMN product_option_groups.name_en IS
    'ชื่อสินค้าอังกฤษที่แสดงร่วมกันบน product card ของทั้งกลุ่ม';
COMMENT ON COLUMN product_option_groups.short_description_th IS
    'คำโปรยไทยที่แสดงร่วมกันบน product card ของทั้งกลุ่ม';
COMMENT ON COLUMN product_option_groups.short_description_en IS
    'คำโปรยอังกฤษที่แสดงร่วมกันบน product card ของทั้งกลุ่ม';
COMMENT ON COLUMN product_option_groups.version IS
    'เลข version สำหรับ optimistic locking ของข้อมูล card ระดับกลุ่ม';

DO $migration$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_app') THEN
        EXECUTE 'GRANT SELECT ON TABLE product_option_groups TO pluto_app';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_inspector') THEN
        EXECUTE 'GRANT SELECT ON TABLE product_option_groups TO pluto_inspector';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pluto_admin') THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE product_option_groups TO pluto_admin';
    END IF;
END
$migration$;
