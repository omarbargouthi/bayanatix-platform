-- Split business term associations into classification (max 1) vs enrichment (many)
ALTER TABLE bayanat.asset_business_terms
  ADD COLUMN IF NOT EXISTS term_role TEXT NOT NULL DEFAULT 'ENRICHMENT'
    CHECK (term_role IN ('CLASSIFICATION','ENRICHMENT'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_abt_classification_unique
  ON bayanat.asset_business_terms (asset_type_code, asset_id)
  WHERE term_role = 'CLASSIFICATION';
