-- 184: a Communication Plan event can name the framework document it is about, and a
-- roadmap milestone or deliverable can hold files and links of its own. With the Arabic
-- for the new texts (see db/174).
-- Safe to run more than once.

BEGIN;

-- The document an event is about. Deleting the document leaves the event in place.
ALTER TABLE bayanat.gov_comm_events
  ADD COLUMN IF NOT EXISTS related_doc_id integer REFERENCES bayanat.gov_framework_docs(doc_id) ON DELETE SET NULL;

-- Attachments of a roadmap item: rows of the document's attachment table that also carry
-- the item. NULL = an attachment of the document itself. They go when the item goes.
ALTER TABLE bayanat.gov_framework_attachments
  ADD COLUMN IF NOT EXISTS item_id integer REFERENCES bayanat.gov_roadmap_items(item_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS gov_framework_attachments_item_idx ON bayanat.gov_framework_attachments (item_id) WHERE item_id IS NOT NULL;

CREATE TEMP TABLE _tr184 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr184 (key_code, category_code, base_text, ar_text) VALUES
  ('commPlan.fRelatedDoc', 'UI_COMMPLAN', 'Related document', 'الوثيقة ذات العلاقة'),
  ('commPlan.relatedDocHint', 'UI_COMMPLAN', 'The framework document this event is about — the policy or procedure being updated, the training material, the roadmap.', 'وثيقة الإطار التي تخصّها الفعالية: السياسة أو الإجراء الجاري تحديثه، أو المادة التدريبية، أو خارطة الطريق.'),
  ('commPlan.noRelatedDoc', 'UI_COMMPLAN', '— None —', '— بدون —'),
  ('roadmapExec.filesToggle', 'UI_ROADMAPEXEC', 'Files and links ({n})', 'الملفات والروابط ({n})'),
  ('roadmapExec.attachRemoveFrom', 'UI_ROADMAPEXEC', 'this item', 'هذا العنصر'),
  ('roadmapExec.attachEmptyHint', 'UI_ROADMAPEXEC', 'Add the deliverable itself, supporting files, or links to where the work is published.', 'أضف المخرج نفسه أو ملفات داعمة أو روابط إلى مكان نشر العمل.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr184
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr184 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
