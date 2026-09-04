ALTER TABLE products
    ADD CONSTRAINT products_delivery_legacy_sync_check
        CHECK (instant_delivery = (delivery_type = 'INSTANT')),
    ADD CONSTRAINT products_status_legacy_sync_check
        CHECK (active = (status = 'ACTIVE')),
    ADD CONSTRAINT products_sort_order_legacy_sync_check
        CHECK (catalog_order = sort_order);

COMMENT ON CONSTRAINT products_delivery_legacy_sync_check ON products IS
    'ป้องกันค่า legacy instant_delivery ไม่ตรงกับ delivery_type';
COMMENT ON CONSTRAINT products_status_legacy_sync_check ON products IS
    'ป้องกันค่า legacy active ไม่ตรงกับ status';
COMMENT ON CONSTRAINT products_sort_order_legacy_sync_check ON products IS
    'ป้องกันค่า legacy catalog_order ไม่ตรงกับ sort_order';
