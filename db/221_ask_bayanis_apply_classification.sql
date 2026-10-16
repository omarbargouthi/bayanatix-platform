-- 221: Ask Bayanis can propose classification changes that a user applies with one
-- button, when an administrator allows it (Configuration › Ask Bayanis; off by default).
-- Proposals are stored with the assistant's message, so Apply uses what the server
-- proposed, never what the browser sends. Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.chat_messages ADD COLUMN IF NOT EXISTS actions_json jsonb;

INSERT INTO bayanat.system_config (key, value) VALUES ('ask_bayanis_apply_classification', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TEMP TABLE _tr221 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr221 (key_code, category_code, base_text, ar_text) VALUES
  ('chat.applyTitle', 'UI_CHAT', 'Proposed classification changes', 'تغييرات التصنيف المقترحة'),
  ('chat.applyHint', 'UI_CHAT', 'Untick any you don''t want. Each change is recorded in the audit log and as a Classify Asset request.', 'ألغِ تحديد ما لا تريده. تُسجَّل كل تغييرات في سجل التدقيق وفي طلب «تصنيف أصل».'),
  ('chat.applyButton', 'UI_CHAT', 'Apply {n} selected', 'تطبيق المحدد ({n})'),
  ('chat.applyConfirm', 'UI_CHAT', 'Classify {n} column(s) of {table}? Their sensitivity level and personal data category will change.', 'هل تريد تصنيف {n} من أعمدة {table}؟ سيتغيّر مستوى حساسيتها وفئة بياناتها الشخصية.'),
  ('chat.applyConfirmYes', 'UI_CHAT', 'Apply', 'تطبيق'),
  ('chat.applying', 'UI_CHAT', 'Applying…', 'جارٍ التطبيق…'),
  ('chat.applied', 'UI_CHAT', 'Applied to {n} column(s) on {date}.', 'طُبّق على {n} من الأعمدة في {date}.'),
  ('chat.appliedRequest', 'UI_CHAT', 'Request #{id}', 'الطلب رقم {id}'),
  ('chat.applyFailed', 'UI_CHAT', 'Couldn''t apply: {error}', 'تعذّر التطبيق: {error}'),
  ('chat.currentTerm', 'UI_CHAT', 'now {term}', 'حالياً {term}');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr221
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr221 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
