CREATE UNIQUE INDEX products_multi_option_group_label_th_uq
    ON products (option_group, lower(trim(option_label_th)))
    WHERE selection_mode = 'MULTI_OPTION';

CREATE UNIQUE INDEX products_multi_option_group_label_en_uq
    ON products (option_group, lower(trim(option_label_en)))
    WHERE selection_mode = 'MULTI_OPTION';

COMMENT ON INDEX products_multi_option_group_label_th_uq IS
    'ป้องกันรายการย่อยในกลุ่ม MULTI_OPTION ใช้ชื่อ option ภาษาไทยซ้ำกัน';
COMMENT ON INDEX products_multi_option_group_label_en_uq IS
    'ป้องกันรายการย่อยในกลุ่ม MULTI_OPTION ใช้ชื่อ option ภาษาอังกฤษซ้ำกัน';
