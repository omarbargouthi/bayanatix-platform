-- 211: Help Center — reporting a breach from New Request. Same pattern as db/204.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr211 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr211 (key_code, base_text, ar_text) VALUES
  ('helpdoc.data-breaches.how.body', E'1. Anyone who suspects a breach reports it: **New Request › Report a data breach** (open to every user, also from a table''s New Request), or **Report a breach** on this page. A short description and when it became known are enough; compliance officers are notified at once.\n2. The compliance officer (or administrator) assigns a handler, adds the affected assets and records the risk.\n3. Notify the regulator and record when, with their reference; notify the data subjects when the risk is high. **Regulator report (PDF)** gives the details a notification asks for.\n4. Record the containment and prevention measures, then **Close** the breach. Bayanis lists anything still missing. A report that turns out not to involve personal data is closed as **Not a breach**.\n\nCompliance officers and administrators see every breach. The person who reported a breach, and its handler, see that breach; only officers, administrators and the handler can change it. Breaches are never deleted.', E'1. يبلّغ كل من يشتبه بخرق عنه: **طلب جديد › الإبلاغ عن خرق للبيانات** (متاح لكل مستخدم، ومن صفحة الجدول أيضاً عبر طلب جديد)، أو **الإبلاغ عن خرق** في هذه الصفحة. ويكفي وصف قصير ووقت العلم به، ويُشعَر مسؤولو الامتثال فوراً.\n2. يُسند مسؤول الامتثال (أو مدير النظام) مسؤولاً عن المعالجة، ويضيف الأصول المتأثرة، ويسجّل الخطر.\n3. أشعر الجهة المختصة وسجّل وقت الإشعار ورقم مرجعها، وأبلغ أصحاب البيانات عندما يكون الخطر مرتفعاً. ويوفر **تقرير الجهة المختصة (PDF)** التفاصيل التي يطلبها الإشعار.\n4. سجّل إجراءات الاحتواء والوقاية، ثم **أغلق** الخرق. ويعرض بيانيس ما ينقص إن وُجد. والبلاغ الذي يتبيّن أنه لا يمسّ بيانات شخصية يُغلق بوصفه **ليس خرقاً**.\n\nيرى مسؤولو الامتثال ومديرو النظام كل الخروقات. ويرى المُبلِّغ والمسؤول عن المعالجة الخرق الخاص بهما؛ ولا يغيّره إلا مسؤولو الامتثال ومديرو النظام والمسؤول عن المعالجة. ولا تُحذف الخروقات أبداً.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep211 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr211 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr211 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr211 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr211
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr211 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep211)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
