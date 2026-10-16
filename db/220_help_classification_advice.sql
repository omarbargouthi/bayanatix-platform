-- 220: Help Center — classifying a column by hand, and classification advice from Ask
-- Bayanis. Same pattern as db/204. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr220 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr220 (key_code, base_text, ar_text) VALUES
  ('helpdoc.classification.how.body', E'1. Open **Classification** and run a scan for a source, schema or table (scans also run after each crawl).\n2. Review the queue: accept, change or reject each suggestion.\n3. Classification changes go through the classification review workflow when one is set up.\n\n### Classifying a column by hand\n1. Open the table in **Data Catalog** and find the column.\n2. Click **Edit Column** (in the column''s row, or at the bottom of its details).\n3. Under **Business Terms**, choose the term in the **Classification** slot. The term gives the column its sensitivity level and personal data category.\n4. Save.\n\n### Advice from Ask Bayanis\nOn a table''s page, ask Ask Bayanis "What classification suits the columns of this table?". It reviews each column (name, type, description, keys, Bayanis''s suggestions and profiling statistics, never the values) and recommends a classification term from your glossary, with its reasons and how sure it is. It changes nothing: a steward applies the recommendations as above.', E'1. افتح **التصنيف** وشغّل فحصاً لمصدر أو مخطط أو جدول (تُشغَّل الفحوص أيضاً بعد كل زحف).\n2. راجع قائمة الانتظار: اقبل كل اقتراح أو غيّره أو ارفضه.\n3. تمر تغييرات التصنيف بسير عمل مراجعة التصنيف عند إعداده.\n\n### تصنيف عمود يدوياً\n1. افتح الجدول في **كتالوج البيانات** وابحث عن العمود.\n2. انقر **تعديل العمود** (في صف العمود، أو أسفل تفاصيله).\n3. تحت **مصطلحات الأعمال**، اختر المصطلح في خانة **التصنيف**. يمنح المصطلح العمود مستوى حساسيته وفئة بياناته الشخصية.\n4. احفظ.\n\n### نصيحة من «اسأل بيانيس»\nفي صفحة الجدول، اسأل «اسأل بيانيس»: "ما التصنيف المناسب لأعمدة هذا الجدول؟". فيراجع كل عمود (الاسم، والنوع، والوصف، والمفاتيح، واقتراحات بيانيس، وإحصاءات التنميط، لا القيم أبداً)، ويوصي بمصطلح تصنيف من مسرد مصطلحاتك، مع أسبابه ومدى ثقته. ولا يغيّر شيئاً: يطبّق أمين البيانات التوصيات كما في الخطوات أعلاه.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep220 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr220 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr220 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr220 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr220
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr220 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep220)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
