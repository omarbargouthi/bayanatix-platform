-- 215: Link the privacy laws to the compliance frameworks (Governance › Compliance).
--  * Breaches: the laws preselected on a new breach are those whose framework is marked
--    applicable in Regulation Setup (lib/privacy/breach.ts defaultBreachRegulations), so
--    the separate setting from db/212 goes. Ontario PHIPA (framework ON_PHIPA) joins the
--    breach laws; it needs no schema change.
--  * Impact assessments: a questionnaire names its framework, and is offered only while
--    that framework is applicable (or when no such framework is set up).
-- Safe to run more than once.

BEGIN;

DELETE FROM bayanat.system_config WHERE key = 'breach_default_regulations';

ALTER TABLE bayanat.dpia_templates ADD COLUMN IF NOT EXISTS framework_code text;

UPDATE bayanat.dpia_templates SET framework_code = v.framework
FROM (VALUES ('PDPL', 'PDPL'), ('GDPR', 'GDPR'), ('LAW25', 'QC_LAW25'), ('PIPEDA', 'PIPEDA')) AS v(template, framework)
WHERE template_code = v.template AND framework_code IS NULL;

COMMIT;
