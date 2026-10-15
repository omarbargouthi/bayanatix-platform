-- 204: Help Center — Configuration documents encryption keys and key rotation (db/203).
-- The English is synced by the app (lib/help/docs/admin.ts); this sets it ahead of that
-- sync on a fresh deploy, marks other translations of a changed text out of date as the
-- sync would, and adds the Arabic draft (AI_TRANSLATED, for review in the Workbench).
-- Never replaces a translation a person has edited or verified. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr204 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr204 (key_code, base_text, ar_text) VALUES
  ('helpdoc.configuration.what.body', E'Administration › Configuration holds the settings that shape Bayanis for your organisation. Changes apply to everyone.\n\n| Area | What you set |\n|---|---|\n| Data Management | Lists of values (table types, classification levels, data domains, quality dimensions and severities, governance roles), custom attributes, sample data, follow settings, sensitive information types, table and column type rules |\n| Privacy & Retention | Data categories, consent notice, impact assessment questionnaires in use and the default |\n| Branding | Your logo, shown next to Bayanis |\n| Scheduling | Automatic jobs (report snapshots, regulation trends, the daily impact assessment check) and their schedules |\n| Security | Sign-in and password settings, and the encryption key for stored passwords and keys |\n| Compliance | Compliance assessment settings |\n| AI | AI enrichment settings: thresholds, freshness window, token budget |\n| FOI | Freedom of information settings such as fees and response times |', E'تحوي صفحة الإدارة › الإعدادات الإعدادات التي تكيّف بيانيس لمؤسستك. وتنطبق التغييرات على الجميع.\n\n| المجال | ما تحدده |\n|---|---|\n| إدارة البيانات | قوائم القيم (أنواع الجداول، ومستويات التصنيف، ومجالات البيانات، وأبعاد الجودة ومستويات خطورتها، وأدوار الحوكمة)، والسمات المخصصة، وبيانات العينة، وإعدادات المتابعة، وأنواع المعلومات الحساسة، وقواعد أنواع الجداول والأعمدة |\n| الخصوصية والاحتفاظ | فئات البيانات، وإشعار الموافقة، واستبيانات تقييم الأثر المستخدمة والاستبيان الافتراضي |\n| الهوية المرئية | شعار مؤسستك، ويظهر بجانب بيانيس |\n| الجدولة | المهام التلقائية (لقطات التقارير، واتجاهات الأنظمة، والفحص اليومي لتقييمات الأثر) وجداولها الزمنية |\n| الأمان | إعدادات تسجيل الدخول وكلمات المرور، ومفتاح تشفير كلمات المرور والمفاتيح المخزنة |\n| الامتثال | إعدادات تقييم الامتثال |\n| الذكاء الاصطناعي | إعدادات إثراء الذكاء الاصطناعي: الحدود، ونافذة الحداثة، وميزانية الرموز |\n| حرية المعلومات | إعدادات حرية المعلومات مثل الرسوم ومدد الرد |'),
  ('helpdoc.configuration.encryption-keys.title', E'Encryption keys and key rotation', E'مفاتيح التشفير وتدويرها'),
  ('helpdoc.configuration.encryption-keys.body', E'Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored encrypted (AES-256-GCM). The key is held in the server environment, not in the database, and each stored value records which key encrypted it.\n\n**Configuration › Encryption Keys** shows the current key and any previous keys (by a short identifier, never the key itself), how many stored secrets use each, and when they were last re-encrypted.\n\n### Rotating the key\n1. The server administrator generates a new key and sets it as the current key, keeping the old one as a previous key, then restarts Bayanis.\n2. Click **Re-encrypt with the current key**. Each secret is opened with its old key, encrypted with the new one and checked before it is saved. Nobody re-enters a password.\n3. When the old key shows *no longer used*, the server administrator removes it.\n\nEvery re-encryption is recorded in the audit log. A secret that cannot be opened with any configured key is listed by name, so it can be entered again.', E'تُحفظ كلمات مرور مصادر البيانات، ومفاتيح مزودي الذكاء الاصطناعي، وكلمات مرور ربط LDAP، وسر عميل الدخول الموحد (SSO) مشفرةً (AES-256-GCM). ويُحفظ المفتاح في بيئة الخادم لا في قاعدة البيانات، وتسجّل كل قيمة مخزنة المفتاح الذي شُفّرت به.\n\nتعرض صفحة **الإعدادات › مفاتيح التشفير** المفتاح الحالي وأي مفاتيح سابقة (بمعرّف قصير، لا بالمفتاح نفسه)، وعدد الأسرار المخزنة التي تستخدم كلاً منها، وموعد آخر إعادة تشفير.\n\n### تدوير المفتاح\n1. ينشئ مسؤول الخادم مفتاحاً جديداً ويعيّنه مفتاحاً حالياً، مع إبقاء المفتاح القديم مفتاحاً سابقاً، ثم يعيد تشغيل بيانيس.\n2. انقر **إعادة التشفير بالمفتاح الحالي**. يُفتح كل سر بمفتاحه القديم، ويُشفَّر بالمفتاح الجديد، ويُتحقق منه قبل حفظه. ولا يحتاج أحد إلى إعادة إدخال كلمة مرور.\n3. عندما يظهر المفتاح القديم بأنه *لم يعد مستخدماً*، يزيله مسؤول الخادم.\n\nتُسجَّل كل إعادة تشفير في سجل التدقيق. ويُدرج باسمه أي سر لا يمكن فتحه بأي مفتاح مُعدّ، ليُعاد إدخاله.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep204 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr204 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr204 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr204 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr204
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr204 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep204)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
