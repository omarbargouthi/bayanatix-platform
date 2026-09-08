-- Phase 3 of the translation standardization pass — registers the remaining
-- translation categories (Regulation Groups excluded: verified zero code
-- consumers of its Arabic or even English name anywhere in the app, so there
-- is nothing to migrate).

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('DQ_DIMENSIONS',             'Data Quality Dimensions',              'LIST'),
  ('DATA_CATEGORIES',           'Data Categories (Open Data/Privacy/Retention)', 'LIST'),
  ('REPORT_KPIS',               'Report KPI Definitions',               'LIST'),
  ('CUSTOM_ASSET_TYPES',        'Custom Asset Type Names',              'LIST'),
  ('CUSTOM_ASSET_ATTRS',        'Custom Asset Type Attribute Labels',   'LIST'),
  ('CUSTOM_RELATIONSHIP_TYPES', 'Custom Relationship Type Names',       'LIST')
ON CONFLICT (category_code) DO NOTHING;
