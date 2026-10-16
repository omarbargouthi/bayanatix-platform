-- 219: Help Center — Ask Bayanis knows the page the user is on. Same pattern as db/204.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr219 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr219 (key_code, base_text, ar_text) VALUES
  ('helpdoc.search-and-assistant.assistant.body', E'The chat bubble at the bottom of every page opens the assistant. Ask about your catalog in English or Arabic, for example "Which tables hold national IDs?", "What is the data quality of the customer table?" or "Which regulations are we least compliant with?".\n\nThe assistant answers only from what it looks up in Bayanis while answering, and says so when it cannot find something. It works on metadata, statistics and statuses and never shows row-level data values. It sees what any signed-in user can see.\n\nIt also answers "how do I…" questions from this Help Center, step by step, with links to the pages it used, for example "How do I report a data breach?". Platform administrators can also ask technical support questions, such as "How do I restart Bayanis?", "How do I find errors in the logs?" or "How do I change how Bayanis signs in to HashiCorp Vault?". It gives the steps and commands from the Technical support guides and never makes up a command; it does not run anything on the server itself.\n\nThe assistant knows which page you are on, so you can ask about it directly: "What does this page show?", "Why can''t I close this breach?", "What is left to do on this assessment?" or "Is this table classified?". It reads the page''s Help Center document, and on a breach, an impact assessment or a request it sees the statuses, deadlines and counts the page shows. Names, descriptions and notes on the page are not sent to the assistant.', E'تفتح فقاعة المحادثة أسفل كل صفحة المساعد. اسأل عن الكتالوج بالعربية أو الإنجليزية، مثل "ما الجداول التي تحوي أرقام الهوية الوطنية؟" أو "ما جودة بيانات جدول العملاء؟" أو "ما الأنظمة التي نحن أقل امتثالاً لها؟".\n\nيجيب المساعد فقط مما يبحث عنه في بيانيس أثناء الإجابة، ويوضح ذلك عندما لا يجد شيئاً. ويعمل على البيانات الوصفية والإحصاءات والحالات، ولا يعرض أبداً قيم البيانات على مستوى الصفوف. ويرى ما يراه أي مستخدم مسجّل.\n\nويجيب كذلك عن أسئلة "كيف أقوم بـ…" من مركز المساعدة هذا، خطوة بخطوة، مع روابط للصفحات التي استند إليها، مثل "كيف أبلّغ عن خرق للبيانات؟". ويستطيع مديرو المنصة أيضاً طرح أسئلة الدعم الفني، مثل "كيف أعيد تشغيل بيانيس؟" أو "كيف أجد الأخطاء في السجلات؟" أو "كيف أغيّر طريقة دخول بيانيس إلى HashiCorp Vault؟". ويعطي الخطوات والأوامر من أدلة الدعم الفني ولا يختلق أي أمر، ولا ينفّذ بنفسه أي شيء على الخادم.\n\nويعرف المساعد الصفحة التي أنت فيها، فيمكنك السؤال عنها مباشرةً: "ماذا تعرض هذه الصفحة؟" أو "لماذا لا أستطيع إغلاق هذا الخرق؟" أو "ما الذي بقي في هذا التقييم؟" أو "هل هذا الجدول مصنّف؟". ويقرأ مستند مركز المساعدة الخاص بالصفحة، وفي صفحة الخرق أو تقييم الأثر أو الطلب يرى الحالات والمواعيد النهائية والأعداد التي تعرضها الصفحة. ولا تُرسل إلى المساعد الأسماء والأوصاف والملاحظات الظاهرة في الصفحة.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep219 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr219 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr219 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr219 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr219
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr219 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep219)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
