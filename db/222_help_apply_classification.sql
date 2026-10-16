-- 222: Help Center — applying Ask Bayanis's classification advice when an administrator
-- allows it (db/221). Same pattern as db/204. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr222 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr222 (key_code, base_text, ar_text) VALUES
  ('helpdoc.classification.how.body', E'1. Open **Classification** and run a scan for a source, schema or table (scans also run after each crawl).\n2. Review the queue: accept, change or reject each suggestion.\n3. Classification changes go through the classification review workflow when one is set up.\n\n### Classifying a column by hand\n1. Open the table in **Data Catalog** and find the column.\n2. Click **Edit Column** (in the column''s row, or at the bottom of its details).\n3. Under **Business Terms**, choose the term in the **Classification** slot. The term gives the column its sensitivity level and personal data category.\n4. Save.\n\n### Advice from Ask Bayanis\nOn a table''s page, ask Ask Bayanis "What classification suits the columns of this table?". It reviews each column (name, type, description, keys, Bayanis''s suggestions and profiling statistics, never the values) and recommends a classification term from your glossary, with its reasons and how sure it is. It changes nothing by itself: a steward applies the recommendations as above.\n\nWhen an administrator allows it (**Configuration › Ask Bayanis › Allow applying classification advice**, off by default), users who may edit metadata also see the recommended changes under the answer. They untick any they don''t want, confirm and click **Apply**. Only terms Bayanis checked against each column are offered. Every change is recorded in the audit log and as a **Classify Asset** request, which follows its workflow when one is set up.', E'1. افتح **التصنيف** وشغّل فحصاً لمصدر أو مخطط أو جدول (تُشغَّل الفحوص أيضاً بعد كل زحف).\n2. راجع قائمة الانتظار: اقبل كل اقتراح أو غيّره أو ارفضه.\n3. تمر تغييرات التصنيف بسير عمل مراجعة التصنيف عند إعداده.\n\n### تصنيف عمود يدوياً\n1. افتح الجدول في **كتالوج البيانات** وابحث عن العمود.\n2. انقر **تعديل العمود** (في صف العمود، أو أسفل تفاصيله).\n3. تحت **مصطلحات الأعمال**، اختر المصطلح في خانة **التصنيف**. يمنح المصطلح العمود مستوى حساسيته وفئة بياناته الشخصية.\n4. احفظ.\n\n### نصيحة من «اسأل بيانيس»\nفي صفحة الجدول، اسأل «اسأل بيانيس»: "ما التصنيف المناسب لأعمدة هذا الجدول؟". فيراجع كل عمود (الاسم، والنوع، والوصف، والمفاتيح، واقتراحات بيانيس، وإحصاءات التنميط، لا القيم أبداً)، ويوصي بمصطلح تصنيف من مسرد مصطلحاتك، مع أسبابه ومدى ثقته. ولا يغيّر شيئاً بنفسه: يطبّق أمين البيانات التوصيات كما في الخطوات أعلاه.\n\nوعندما يسمح مدير النظام بذلك (**الإعدادات › اسأل بيانيس › السماح بتطبيق نصائح التصنيف**، وهو متوقف افتراضياً)، يرى المستخدمون الذين يحق لهم تعديل البيانات الوصفية التغييرات الموصى بها أسفل الإجابة. فيلغون تحديد ما لا يريدونه، ويؤكدون، وينقرون **تطبيق**. ولا تُعرض إلا المصطلحات التي تحقق منها بيانيس لكل عمود. وتُسجَّل كل تغييرات في سجل التدقيق وفي طلب **تصنيف أصل**، يمر بسير العمل الخاص به عند إعداده.'),
  ('helpdoc.configuration.what.body', E'Administration › Configuration holds the settings that shape Bayanis for your organisation. Changes apply to everyone.\n\n| Area | What you set |\n|---|---|\n| Data Management | Lists of values (table types, classification levels, data domains, quality dimensions and severities, governance roles), custom attributes, sample data, follow settings, sensitive information types, table and column type rules |\n| Privacy & Retention | Data categories, consent notice, impact assessment questionnaires in use and the default |\n| Branding | Your logo, shown next to Bayanis |\n| Scheduling | Automatic jobs (report snapshots, regulation trends, the daily impact assessment check) and their schedules |\n| Security | Sign-in and password settings, and the encryption key for stored passwords and keys |\n| Compliance | Compliance assessment settings |\n| AI | AI enrichment settings: thresholds, freshness window, token budget; Ask Bayanis: whether users may apply its classification advice (off by default) |\n| FOI | Freedom of information settings such as fees and response times |', E'تحوي صفحة الإدارة › الإعدادات الإعدادات التي تكيّف بيانيس لمؤسستك. وتنطبق التغييرات على الجميع.\n\n| المجال | ما تحدده |\n|---|---|\n| إدارة البيانات | قوائم القيم (أنواع الجداول، ومستويات التصنيف، ومجالات البيانات، وأبعاد الجودة ومستويات خطورتها، وأدوار الحوكمة)، والسمات المخصصة، وبيانات العينة، وإعدادات المتابعة، وأنواع المعلومات الحساسة، وقواعد أنواع الجداول والأعمدة |\n| الخصوصية والاحتفاظ | فئات البيانات، وإشعار الموافقة، واستبيانات تقييم الأثر المستخدمة والاستبيان الافتراضي |\n| الهوية المرئية | شعار مؤسستك، ويظهر بجانب بيانيس |\n| الجدولة | المهام التلقائية (لقطات التقارير، واتجاهات الأنظمة، والفحص اليومي لتقييمات الأثر) وجداولها الزمنية |\n| الأمان | إعدادات تسجيل الدخول وكلمات المرور، ومفتاح تشفير كلمات المرور والمفاتيح المخزنة |\n| الامتثال | إعدادات تقييم الامتثال |\n| الذكاء الاصطناعي | إعدادات إثراء الذكاء الاصطناعي: الحدود، ونافذة الحداثة، وميزانية الرموز؛ و«اسأل بيانيس»: هل يجوز للمستخدمين تطبيق نصائح التصنيف (متوقف افتراضياً) |\n| حرية المعلومات | إعدادات حرية المعلومات مثل الرسوم ومدد الرد |');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep222 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr222 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr222 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr222 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr222
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr222 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep222)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
