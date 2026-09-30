-- =====================================================
-- Migration 128: Add a "Not Started" status option for COMPLIANCE_ONLY regulations
-- =====================================================
-- A never-assessed requirement's submissionStatus defaults to NOT_COMPLETE
-- (lib/queries/gov-compliance.ts's listRequirements()). Every COMPLIANCE_ONLY
-- framework's STATUS option set (COMPLIANCE/PARTIAL_COMPLIANCE/NON_COMPLIANCE/NA)
-- had no NOT_COMPLETE entry, so the status <select> had nothing to match that
-- default value against and silently fell back to displaying its first option
-- (Compliance) as if it had been selected — even though nothing had actually
-- been assessed yet, and the real (correct) overall progress % stayed at 0.
--
-- Backfills every EXISTING COMPLIANCE_ONLY framework; lib/queries/gov-
-- compliance.ts's createFramework() already seeds this correctly for new ones.

INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
SELECT f.framework_id, 'STATUS', 'NOT_COMPLETE', 'Not Started', 'لم يبدأ', '#6B7280', 0
FROM bayanat.gov_compliance_frameworks f
WHERE f.assessment_mode = 'COMPLIANCE_ONLY'
ON CONFLICT (framework_id, config_group, code) DO NOTHING;
