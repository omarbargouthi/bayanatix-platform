-- 190: Editing the impact assessment questionnaires (lib/privacy/dpia-templates.ts).
-- A question that an assessment has already answered is retired rather than deleted: new
-- and ongoing assessments no longer ask it, and the assessments that answered it keep the
-- answer. Decided versions are snapshots and are not affected by any edit.
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.dpia_template_questions ADD COLUMN IF NOT EXISTS is_retired_indicator boolean NOT NULL DEFAULT false;
ALTER TABLE bayanat.dpia_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE bayanat.dpia_templates ADD COLUMN IF NOT EXISTS updated_by_user_id varchar(100);

COMMIT;
