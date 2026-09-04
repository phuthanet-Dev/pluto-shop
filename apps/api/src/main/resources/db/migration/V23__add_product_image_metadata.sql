ALTER TABLE products
    ADD COLUMN image_key VARCHAR(80),
    ADD COLUMN image_content_type VARCHAR(32),
    ADD COLUMN image_size_bytes BIGINT,
    ADD COLUMN image_width INTEGER,
    ADD COLUMN image_height INTEGER,
    ADD COLUMN image_sha256 CHAR(64),
    ADD CONSTRAINT products_image_key_uq UNIQUE (image_key),
    ADD CONSTRAINT products_image_metadata_complete_check CHECK (
        (image_key IS NULL
            AND image_content_type IS NULL
            AND image_size_bytes IS NULL
            AND image_width IS NULL
            AND image_height IS NULL
            AND image_sha256 IS NULL)
        OR (image_key IS NOT NULL
            AND image_content_type IS NOT NULL
            AND image_size_bytes IS NOT NULL
            AND image_width IS NOT NULL
            AND image_height IS NOT NULL
            AND image_sha256 IS NOT NULL)
    ),
    ADD CONSTRAINT products_image_key_format_check CHECK (
        image_key IS NULL
        OR image_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ),
    ADD CONSTRAINT products_image_content_type_check CHECK (
        image_content_type IS NULL OR image_content_type IN ('image/jpeg', 'image/png')
    ),
    ADD CONSTRAINT products_image_size_check CHECK (
        image_size_bytes IS NULL OR image_size_bytes > 0
    ),
    ADD CONSTRAINT products_image_width_check CHECK (
        image_width IS NULL OR image_width > 0
    ),
    ADD CONSTRAINT products_image_height_check CHECK (
        image_height IS NULL OR image_height > 0
    ),
    ADD CONSTRAINT products_image_sha256_check CHECK (
        image_sha256 IS NULL OR image_sha256 ~ '^[0-9a-f]{64}$'
    );

COMMENT ON TABLE products IS
    'แคตตาล็อกสินค้าดิจิทัลที่เผยแพร่บนหน้าร้าน โดยเก็บเฉพาะ metadata ของรูปสินค้า ไม่เก็บ binary';
COMMENT ON COLUMN products.image_key IS
    'opaque UUID key ของไฟล์รูปใน product-media storage; ไม่ใช่ path เต็มและไม่ใช่ชื่อไฟล์จากผู้ใช้';
COMMENT ON COLUMN products.image_content_type IS
    'ชนิด MIME ของรูปที่ตรวจจาก bytes จริง ปัจจุบันรองรับ image/jpeg และ image/png';
COMMENT ON COLUMN products.image_size_bytes IS
    'ขนาดไฟล์รูปที่ผ่านการตรวจสอบ หน่วย byte';
COMMENT ON COLUMN products.image_width IS
    'ความกว้างรูปที่ผ่านการตรวจสอบ หน่วย pixel';
COMMENT ON COLUMN products.image_height IS
    'ความสูงรูปที่ผ่านการตรวจสอบ หน่วย pixel';
COMMENT ON COLUMN products.image_sha256 IS
    'SHA-256 ของ binary รูปในรูป hexadecimal ตัวพิมพ์เล็ก สำหรับตรวจสอบความถูกต้องและ reconciliation';
