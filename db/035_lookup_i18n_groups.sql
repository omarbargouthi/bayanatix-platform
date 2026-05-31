-- Rebuild DQ_DIMENSION group to match dq_dimensions operational codes
DELETE FROM bayanat.app_lookups WHERE lookup_group = 'DQ_DIMENSION';

INSERT INTO bayanat.app_lookups
  (lookup_group, lookup_code, lookup_label, label_ar, description, sort_order, is_active, is_system)
SELECT
  'DQ_DIMENSION'        AS lookup_group,
  dimension_code        AS lookup_code,
  dimension_name_text   AS lookup_label,
  name_ar_text          AS label_ar,
  description_text      AS description,
  ROW_NUMBER() OVER (ORDER BY dimension_code) AS sort_order,
  true                  AS is_active,
  true                  AS is_system
FROM bayanat.dq_dimensions;

-- Arabic labels for TABLE_TYPE
UPDATE bayanat.app_lookups SET label_ar = 'بيانات رئيسية'    WHERE lookup_group = 'TABLE_TYPE' AND lookup_code = 'MASTER';
UPDATE bayanat.app_lookups SET label_ar = 'معاملاتي'          WHERE lookup_group = 'TABLE_TYPE' AND lookup_code = 'TRANSACTIONAL';
UPDATE bayanat.app_lookups SET label_ar = 'مرجعي'             WHERE lookup_group = 'TABLE_TYPE' AND lookup_code = 'REFERENCE';
UPDATE bayanat.app_lookups SET label_ar = 'مرحلي'             WHERE lookup_group = 'TABLE_TYPE' AND lookup_code = 'STAGING';
UPDATE bayanat.app_lookups SET label_ar = 'تقارير'            WHERE lookup_group = 'TABLE_TYPE' AND lookup_code = 'REPORTING';

-- Arabic labels for ASSET_TYPE
UPDATE bayanat.app_lookups SET label_ar = 'أصل أعمال'  WHERE lookup_group = 'ASSET_TYPE' AND lookup_code = 'BUSINESS';
UPDATE bayanat.app_lookups SET label_ar = 'أصل تقني'   WHERE lookup_group = 'ASSET_TYPE' AND lookup_code = 'TECHNICAL';

-- DQ_SEVERITY group
INSERT INTO bayanat.app_lookups
  (lookup_group, lookup_code, lookup_label, label_ar, description, sort_order, is_active, is_system)
VALUES
  ('DQ_SEVERITY', 'INFO',     'Info',     'معلوماتي', 'Informational finding',           1, true, true),
  ('DQ_SEVERITY', 'WARNING',  'Warning',  'تحذير',    'Warning — approaching threshold', 2, true, true),
  ('DQ_SEVERITY', 'CRITICAL', 'Critical', 'حرج',      'Critical — threshold breached',   3, true, true)
ON CONFLICT (lookup_group, lookup_code) DO UPDATE
  SET lookup_label = EXCLUDED.lookup_label, label_ar = EXCLUDED.label_ar;

-- GOVERNANCE_ROLE group (seeded from stakeholder_roles; app_lookups becomes display source of truth)
INSERT INTO bayanat.app_lookups
  (lookup_group, lookup_code, lookup_label, label_ar, description, sort_order, is_active, is_system)
SELECT
  'GOVERNANCE_ROLE'  AS lookup_group,
  role_code          AS lookup_code,
  role_name_text     AS lookup_label,
  NULL               AS label_ar,
  description_text   AS description,
  CASE role_code WHEN 'OWNER' THEN 1 WHEN 'BIZ_STEWARD' THEN 2 ELSE 3 END AS sort_order,
  true               AS is_active,
  true               AS is_system
FROM bayanat.stakeholder_roles
ON CONFLICT (lookup_group, lookup_code) DO UPDATE
  SET lookup_label = EXCLUDED.lookup_label;

UPDATE bayanat.app_lookups SET label_ar = 'مالك البيانات'          WHERE lookup_group = 'GOVERNANCE_ROLE' AND lookup_code = 'OWNER';
UPDATE bayanat.app_lookups SET label_ar = 'أمين البيانات التجارية' WHERE lookup_group = 'GOVERNANCE_ROLE' AND lookup_code = 'BIZ_STEWARD';
UPDATE bayanat.app_lookups SET label_ar = 'أمين البيانات التقنية'  WHERE lookup_group = 'GOVERNANCE_ROLE' AND lookup_code = 'TECH_STEWARD';
