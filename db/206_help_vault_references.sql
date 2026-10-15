-- 206: Help Center — Vault references for passwords (data source credentials and the
-- encryption keys section). Same pattern as db/204: sets the English ahead of the app's
-- sync, marks other translations of a changed text out of date, adds the Arabic draft
-- (AI_TRANSLATED), never replaces a translation a person has edited or verified.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr206 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr206 (key_code, base_text, ar_text) VALUES
  ('helpdoc.data-sources.security.body', E'Passwords and client secrets are stored encrypted, or, when your organisation keeps them in HashiCorp Vault, Bayanis stores only where they are in Vault and reads them each time it connects (see [Encryption keys](/help/configuration#encryption-keys)). Use a read-only account on the source. Bayanis needs to read the system catalog (tables, columns, keys, comments, view definitions) and, for profiling, data quality rules and sample data, to read the tables.', E'تُحفظ كلمات المرور وأسرار العملاء مشفرة، أو، إذا كانت مؤسستك تحتفظ بها في HashiCorp Vault، لا يخزّن بيانيس إلا موضعها في Vault ويقرؤها في كل مرة يتصل فيها (راجع [مفاتيح التشفير](/help/configuration#encryption-keys)). استخدم حساباً للقراءة فقط على المصدر. يحتاج بيانيس إلى قراءة كتالوج النظام (الجداول، والأعمدة، والمفاتيح، والتعليقات، وتعريفات العروض)، وإلى قراءة الجداول من أجل التنميط وقواعد جودة البيانات وبيانات العينة.'),
  ('helpdoc.configuration.encryption-keys.body', E'Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored encrypted. The key is never stored in the database: it is held in the server environment (AES-256-GCM), or in your HashiCorp Vault. Each stored value records which key encrypted it.\n\n**Configuration › Encryption Keys** shows the current key and any previous keys (by a short identifier, never the key itself), how many stored secrets use each, and when they were last re-encrypted.\n\n### Rotating the key\n1. The server administrator generates a new key and sets it as the current key, keeping the old one as a previous key, then restarts Bayanis.\n2. Click **Re-encrypt with the current key**. Each secret is opened with its old key, encrypted with the new one and checked before it is saved. Nobody re-enters a password.\n3. When the old key shows *no longer used*, the server administrator removes it.\n\nEvery re-encryption is recorded in the audit log. A secret that cannot be opened with any configured key is listed by name, so it can be entered again.\n\n### Keeping the key in HashiCorp Vault\nBayanis can use the Transit engine of your HashiCorp Vault instead: Vault holds the key and does the encryption, and Bayanis stores only what Vault returns.\n1. The server administrator sets the Vault address, the key name and how Bayanis signs in to Vault (token, AppRole or Kubernetes) in the server environment, keeping the local key for now, and restarts Bayanis.\n2. Click **Test**, then **Move … to HashiCorp Vault Transit**. Every stored secret moves to Vault; nobody re-enters a password.\n3. When nothing uses the local key any more, the server administrator removes it.\n\nWith Vault, **Rotate key in Vault** creates a new key version, and re-encryption happens inside Vault, so the passwords never pass through Bayanis. If Vault cannot be reached, sign-in with local accounts keeps working; connecting to data sources and AI providers fails with a clear message until Vault is back.\n\n### Passwords kept in Vault\nWhen Vault is configured, every password field (data sources, AI provider keys, LDAP bind passwords, the SSO client secret) offers **Vault reference** next to **Password**. Enter where the password is kept, as *path#field* (for example `secret/bayanis/finance-db#password`), and click **Check** to confirm Bayanis can read it. Bayanis then stores only that location and reads the password from Vault each time it connects, so your security team can change it in Vault without touching Bayanis. The server administrator can limit which Vault paths may be used. On Encryption Keys, these fields are counted as **Vault reference**, and re-encryption leaves them as they are.', E'تُحفظ كلمات مرور مصادر البيانات، ومفاتيح مزودي الذكاء الاصطناعي، وكلمات مرور ربط LDAP، وسر عميل الدخول الموحد (SSO) مشفرةً. ولا يُحفظ المفتاح في قاعدة البيانات أبداً: فهو في بيئة الخادم (AES-256-GCM)، أو في HashiCorp Vault لديكم. وتسجّل كل قيمة مخزنة المفتاح الذي شُفّرت به.\n\nتعرض صفحة **الإعدادات › مفاتيح التشفير** المفتاح الحالي وأي مفاتيح سابقة (بمعرّف قصير، لا بالمفتاح نفسه)، وعدد الأسرار المخزنة التي تستخدم كلاً منها، وموعد آخر إعادة تشفير.\n\n### تدوير المفتاح\n1. ينشئ مسؤول الخادم مفتاحاً جديداً ويعيّنه مفتاحاً حالياً، مع إبقاء المفتاح القديم مفتاحاً سابقاً، ثم يعيد تشغيل بيانيس.\n2. انقر **إعادة التشفير بالمفتاح الحالي**. يُفتح كل سر بمفتاحه القديم، ويُشفَّر بالمفتاح الجديد، ويُتحقق منه قبل حفظه. ولا يحتاج أحد إلى إعادة إدخال كلمة مرور.\n3. عندما يظهر المفتاح القديم بأنه *لم يعد مستخدماً*، يزيله مسؤول الخادم.\n\nتُسجَّل كل إعادة تشفير في سجل التدقيق. ويُدرج باسمه أي سر لا يمكن فتحه بأي مفتاح مُعدّ، ليُعاد إدخاله.\n\n### حفظ المفتاح في HashiCorp Vault\nيمكن لبيانيس أن يستخدم بدلاً من ذلك محرك Transit في HashiCorp Vault لديكم: يحتفظ Vault بالمفتاح ويتولى التشفير، ولا يخزّن بيانيس إلا ما يعيده Vault.\n1. يحدد مسؤول الخادم في بيئة الخادم عنوان Vault، واسم المفتاح، وطريقة دخول بيانيس إلى Vault (رمز وصول، أو AppRole، أو Kubernetes)، مع إبقاء المفتاح المحلي مؤقتاً، ثم يعيد تشغيل بيانيس.\n2. انقر **اختبار**، ثم **نقل … إلى HashiCorp Vault Transit**. تنتقل كل الأسرار المخزنة إلى Vault، ولا يحتاج أحد إلى إعادة إدخال كلمة مرور.\n3. عندما لا يعود أي سر يستخدم المفتاح المحلي، يزيله مسؤول الخادم.\n\nمع Vault، يُنشئ **تدوير المفتاح في Vault** إصداراً جديداً من المفتاح، وتجري إعادة التشفير داخل Vault، فلا تمر كلمات المرور عبر بيانيس. وإذا تعذّر الوصول إلى Vault، يستمر تسجيل الدخول بالحسابات المحلية، أما الاتصال بمصادر البيانات ومزودي الذكاء الاصطناعي فيفشل برسالة واضحة إلى أن يعود Vault.\n\n### كلمات مرور محفوظة في Vault\nعند إعداد Vault، يعرض كل حقل لكلمة مرور (مصادر البيانات، ومفاتيح مزودي الذكاء الاصطناعي، وكلمات مرور ربط LDAP، وسر عميل الدخول الموحد) خيار **مرجع Vault** بجانب **كلمة المرور**. أدخل موضع حفظ كلمة المرور بالصيغة *path#field* (مثل `secret/bayanis/finance-db#password`)، وانقر **تحقق** للتأكد من أن بيانيس يستطيع قراءتها. عندها لا يخزّن بيانيس إلا ذلك الموضع، ويقرأ كلمة المرور من Vault في كل مرة يتصل فيها، فيستطيع فريق الأمن لديكم تغييرها في Vault دون المساس ببيانيس. ويمكن لمسؤول الخادم تحديد مسارات Vault المسموح باستخدامها. وفي صفحة مفاتيح التشفير تُحتسب هذه الحقول ضمن **مرجع Vault**، ولا تغيّرها إعادة التشفير.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep206 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr206 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr206 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr206 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr206
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr206 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep206)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
