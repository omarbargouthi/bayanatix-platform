-- 164: assessment modes as a configuration list.
-- A regulation is assessed in one of two modes. The modes themselves are fixed (each has
-- its own scoring logic), but how they are named and described is now a lookup group —
-- "Assessment Modes" under Administration > Configuration — so the wording shown on the
-- regulation form and details can be changed or translated there.
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.app_lookups (lookup_group, lookup_code, lookup_label, description, sort_order, is_active, is_system, label_ar)
VALUES
  ('ASSESSMENT_MODE', 'COMPLIANCE_ONLY', 'Compliance checklist',
   'Each requirement is assessed on its own: compliant, partly compliant, not compliant or not applicable.', 1, true, true, 'قائمة امتثال'),
  ('ASSESSMENT_MODE', 'MATURITY', 'Maturity (levels 0–5)',
   'Requirements are grouped into maturity levels per standard; the assessment selects the level reached.', 2, true, true, 'نضج (المستويات 0–5)')
ON CONFLICT (lookup_group, lookup_code) DO NOTHING;

COMMIT;
