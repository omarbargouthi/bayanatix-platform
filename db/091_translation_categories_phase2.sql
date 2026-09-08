-- Registers the translation categories for Phase 2 of the translation
-- standardization pass (Governance Domains, Custom Attributes) — a category
-- must exist here before lib/i18n-admin/translatable-fields.ts::syncListValueKeys()
-- can create translation_keys rows under it (FK constraint).

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('GOVERNANCE_DOMAINS', 'Governance Domain Names/Descriptions', 'LIST'),
  ('CUSTOM_ATTRIBUTES',  'Custom Attribute Field Labels',        'LIST')
ON CONFLICT (category_code) DO NOTHING;
