-- Deferred Custom Asset Framework spec §7/FR-4.3: "PI Access by Role" report,
-- feeding off custom_asset_links (HAS_ACCESS_TO / PERFORMED_BY / USES_DATA) seeded
-- by the PI Access Map / RoPA-lite templates. Works with zero data (no template
-- installed yet) the same way other reports degrade gracefully in this app.

INSERT INTO bayanat.report_kpi_definitions
  (kpi_code, report_code, name_en, name_ar, capability_code, metric_key, target_value, direction, format, sort_order)
VALUES
  ('PI_ACCESS_LINK_COUNT',  'PI_ACCESS', 'PI Column Access Grants', 'عدد صلاحيات الوصول للأعمدة الشخصية', 'PDP', 'piAccessLinkCount',  NULL, 'DOWN', 'NUMBER', 1),
  ('PI_ACCESS_ROLES_COUNT', 'PI_ACCESS', 'Roles with PI Access',    'عدد الأدوار ذات صلاحية الوصول',      'PDP', 'piAccessRolesCount', NULL, 'DOWN', 'NUMBER', 2)
ON CONFLICT (kpi_code) DO NOTHING;
