ALTER TABLE schema_probe
    ADD COLUMN replacement_value TEXT;

UPDATE schema_probe
SET replacement_value = legacy_value;

CREATE TABLE schema_probe_related (
    id BIGINT PRIMARY KEY,
    probe_id BIGINT NOT NULL REFERENCES schema_probe(id)
);
