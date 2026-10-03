-- Metadata propagation along lineage (lib/lineage/propagation.ts).
--  * Classification (the CLASSIFICATION glossary term on a column, which carries the
--    classification level, PI flag and PI category) is applied automatically to
--    downstream columns over trusted pass-through links; the most restrictive wins.
--    Such links point at the propagation record that created them
--    (asset_business_terms.propagation_id); manual links (propagation_id NULL)
--    are never touched.
--  * Business terms, descriptions, tags, retention category — and classification
--    over calculated / medium-confidence links — become SUGGESTIONS a steward
--    accepts or rejects.
-- lineage_propagations is both the suggestion queue and the history.

CREATE TABLE IF NOT EXISTS bayanat.lineage_propagations (
  propagation_id     serial PRIMARY KEY,
  field_code         varchar(20) NOT NULL CHECK (field_code IN ('CLASSIFICATION', 'BUSINESS_TERM', 'DESCRIPTION', 'TAG', 'RETENTION')),
  mode_code          varchar(10) NOT NULL CHECK (mode_code IN ('AUTO', 'SUGGEST')),
  status_code        varchar(12) NOT NULL CHECK (status_code IN ('APPLIED', 'SUGGESTED', 'ACCEPTED', 'REJECTED', 'SUPERSEDED')),
  target_asset_type  varchar(20) NOT NULL,
  target_asset_id    integer NOT NULL,
  source_asset_type  varchar(20) NOT NULL,
  source_asset_id    integer NOT NULL,      -- where the value originates (the root, for multi-hop)
  value_ref_id       integer,               -- glossary_id / tag_id / retention category_id
  value_text         text,                  -- description text
  via_lineage_id     integer,               -- the link the value arrived over
  hop_count          integer NOT NULL DEFAULT 1,
  reason_text        text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  decided_by_user_id varchar(100),
  decided_at         timestamptz
);
CREATE INDEX IF NOT EXISTS ix_lineage_prop_target ON bayanat.lineage_propagations (target_asset_type, target_asset_id, field_code);
CREATE INDEX IF NOT EXISTS ix_lineage_prop_open ON bayanat.lineage_propagations (status_code) WHERE status_code IN ('APPLIED', 'SUGGESTED');

ALTER TABLE bayanat.asset_business_terms
  ADD COLUMN IF NOT EXISTS propagation_id integer REFERENCES bayanat.lineage_propagations(propagation_id) ON DELETE SET NULL;
