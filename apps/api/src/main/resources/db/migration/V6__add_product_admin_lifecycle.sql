ALTER TABLE products
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN updated_by VARCHAR(255),
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;

CREATE INDEX products_active_catalog_order_idx
    ON products (active, catalog_order);

COMMENT ON COLUMN products.active IS 'Archived products are hidden from public catalog and unavailable to new carts';
COMMENT ON COLUMN products.updated_by IS 'OIDC subject of the last admin mutation';
COMMENT ON COLUMN products.version IS 'Optimistic-lock version for admin mutations';
