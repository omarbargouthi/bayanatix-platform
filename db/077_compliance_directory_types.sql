-- directory_type is a small, heavily-repeated set of values embedded as free text
-- in gov_compliance_requirements (24 distinct English values across 476 rows) —
-- tracked once per distinct value instead of once per requirement row.
INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('LIST_COMPLIANCE_DIRECTORY_TYPES', 'Compliance Evidence/Directory Types', 'LIST')
ON CONFLICT (category_code) DO NOTHING;
