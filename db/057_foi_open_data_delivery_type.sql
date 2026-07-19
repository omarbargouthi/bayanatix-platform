-- Migration 057: FOI delivery type choice + full column inclusion + FOI traceability on open datasets
-- =====================================================================

-- 1. Add delivery type to foi_requests (officer's choice: publish as open data or one-off record)
ALTER TABLE bayanat.foi_requests
  ADD COLUMN IF NOT EXISTS foi_delivery_type VARCHAR(20)
    CHECK (foi_delivery_type IN ('OPEN_DATA', 'ONE_OFF'));

-- 2. Add FOI back-reference to open_datasets (traceability: which FOI request produced this dataset)
ALTER TABLE bayanat.open_datasets
  ADD COLUMN IF NOT EXISTS foi_request_id INT
    REFERENCES bayanat.foi_requests(foi_request_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_od_foi_request ON bayanat.open_datasets(foi_request_id)
  WHERE foi_request_id IS NOT NULL;

-- 3. Make open_dataset_columns.attribute_id nullable so manual-source columns can be included
ALTER TABLE bayanat.open_dataset_columns
  ALTER COLUMN attribute_id DROP NOT NULL;

-- 4. Add manual_source_text to open_dataset_columns for manual (non-catalog) mappings
ALTER TABLE bayanat.open_dataset_columns
  ADD COLUMN IF NOT EXISTS manual_source_text TEXT;

-- 5. Relax the unique constraint — current one is (dataset_id, attribute_id) which breaks for NULL attribute_id
--    Replace with a partial unique index that only enforces uniqueness when attribute_id IS NOT NULL
ALTER TABLE bayanat.open_dataset_columns
  DROP CONSTRAINT IF EXISTS open_dataset_columns_dataset_id_attribute_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_od_columns_catalog
  ON bayanat.open_dataset_columns(dataset_id, attribute_id)
  WHERE attribute_id IS NOT NULL;

-- 6. Insert "FOI One-off Records" category so one-off deliveries have their own category
INSERT INTO bayanat.data_categories (name, name_ar, sensitivity, description, sort_order, is_active)
VALUES (
  'FOI One-off Records',
  'سجلات طلبات الحصول على المعلومات',
  'INTERNAL',
  'Reference datasets created to fulfil specific Freedom of Information requests. These are not published to the open data portal but are retained for audit and traceability.',
  99,
  true
)
ON CONFLICT DO NOTHING;
