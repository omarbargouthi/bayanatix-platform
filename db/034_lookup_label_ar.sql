-- Add Arabic label column to app_lookups for bilingual classification support
ALTER TABLE bayanat.app_lookups
  ADD COLUMN IF NOT EXISTS label_ar TEXT;

-- Seed Arabic labels for CLASSIFICATION codes
UPDATE bayanat.app_lookups SET label_ar = 'عام'               WHERE lookup_group = 'CLASSIFICATION' AND lookup_code = 'PUBLIC';
UPDATE bayanat.app_lookups SET label_ar = 'داخلي'             WHERE lookup_group = 'CLASSIFICATION' AND lookup_code = 'INTERNAL';
UPDATE bayanat.app_lookups SET label_ar = 'سري'               WHERE lookup_group = 'CLASSIFICATION' AND lookup_code = 'CONFIDENTIAL';
UPDATE bayanat.app_lookups SET label_ar = 'سري للغاية'        WHERE lookup_group = 'CLASSIFICATION' AND lookup_code = 'SECRET';
UPDATE bayanat.app_lookups SET label_ar = 'سري جداً'          WHERE lookup_group = 'CLASSIFICATION' AND lookup_code = 'TOP_SECRET';

-- Add RESTRICTED and PII classification codes if not already present
INSERT INTO bayanat.app_lookups (lookup_group, lookup_code, lookup_label, label_ar, description, sort_order, is_active, is_system)
VALUES
  ('CLASSIFICATION', 'RESTRICTED', 'Restricted', 'مقيّد',                 'Access restricted to specific roles or teams', 3, true, true),
  ('CLASSIFICATION', 'PII',        'PII · Masked','معلومات شخصية · محجوبة', 'Contains personally identifiable information — masked in output', 6, true, true)
ON CONFLICT (lookup_group, lookup_code) DO UPDATE
  SET label_ar = EXCLUDED.label_ar;
