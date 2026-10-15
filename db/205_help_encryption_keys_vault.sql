-- 205: Help Center — the encryption keys section covers HashiCorp Vault Transit.
-- Same pattern as db/204: sets the English ahead of the app's sync, marks other
-- translations of the changed text out of date, adds the Arabic draft (AI_TRANSLATED),
-- never replaces a translation a person has edited or verified. Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr205 (key_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr205 (key_code, base_text, ar_text) VALUES
  ('helpdoc.configuration.encryption-keys.body', E'Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored encrypted. The key is never stored in the database: it is held in the server environment (AES-256-GCM), or in your HashiCorp Vault. Each stored value records which key encrypted it.\n\n**Configuration › Encryption Keys** shows the current key and any previous keys (by a short identifier, never the key itself), how many stored secrets use each, and when they were last re-encrypted.\n\n### Rotating the key\n1. The server administrator generates a new key and sets it as the current key, keeping the old one as a previous key, then restarts Bayanis.\n2. Click **Re-encrypt with the current key**. Each secret is opened with its old key, encrypted with the new one and checked before it is saved. Nobody re-enters a password.\n3. When the old key shows *no longer used*, the server administrator removes it.\n\nEvery re-encryption is recorded in the audit log. A secret that cannot be opened with any configured key is listed by name, so it can be entered again.\n\n### Keeping the key in HashiCorp Vault\nBayanis can use the Transit engine of your HashiCorp Vault instead: Vault holds the key and does the encryption, and Bayanis stores only what Vault returns.\n1. The server administrator sets the Vault address, the key name and how Bayanis signs in to Vault (token, AppRole or Kubernetes) in the server environment, keeping the local key for now, and restarts Bayanis.\n2. Click **Test**, then **Move … to HashiCorp Vault Transit**. Every stored secret moves to Vault; nobody re-enters a password.\n3. When nothing uses the local key any more, the server administrator removes it.\n\nWith Vault, **Rotate key in Vault** creates a new key version, and re-encryption happens inside Vault, so the passwords never pass through Bayanis. If Vault cannot be reached, sign-in with local accounts keeps working; connecting to data sources and AI providers fails with a clear message until Vault is back.', E'تُحفظ كلمات مرور مصادر البيانات، ومفاتيح مزودي الذكاء الاصطناعي، وكلمات مرور ربط LDAP، وسر عميل الدخول الموحد (SSO) مشفرةً. ولا يُحفظ المفتاح في قاعدة البيانات أبداً: فهو في بيئة الخادم (AES-256-GCM)، أو في HashiCorp Vault لديكم. وتسجّل كل قيمة مخزنة المفتاح الذي شُفّرت به.\n\nتعرض صفحة **الإعدادات › مفاتيح التشفير** المفتاح الحالي وأي مفاتيح سابقة (بمعرّف قصير، لا بالمفتاح نفسه)، وعدد الأسرار المخزنة التي تستخدم كلاً منها، وموعد آخر إعادة تشفير.\n\n### تدوير المفتاح\n1. ينشئ مسؤول الخادم مفتاحاً جديداً ويعيّنه مفتاحاً حالياً، مع إبقاء المفتاح القديم مفتاحاً سابقاً، ثم يعيد تشغيل بيانيس.\n2. انقر **إعادة التشفير بالمفتاح الحالي**. يُفتح كل سر بمفتاحه القديم، ويُشفَّر بالمفتاح الجديد، ويُتحقق منه قبل حفظه. ولا يحتاج أحد إلى إعادة إدخال كلمة مرور.\n3. عندما يظهر المفتاح القديم بأنه *لم يعد مستخدماً*، يزيله مسؤول الخادم.\n\nتُسجَّل كل إعادة تشفير في سجل التدقيق. ويُدرج باسمه أي سر لا يمكن فتحه بأي مفتاح مُعدّ، ليُعاد إدخاله.\n\n### حفظ المفتاح في HashiCorp Vault\nيمكن لبيانيس أن يستخدم بدلاً من ذلك محرك Transit في HashiCorp Vault لديكم: يحتفظ Vault بالمفتاح ويتولى التشفير، ولا يخزّن بيانيس إلا ما يعيده Vault.\n1. يحدد مسؤول الخادم في بيئة الخادم عنوان Vault، واسم المفتاح، وطريقة دخول بيانيس إلى Vault (رمز وصول، أو AppRole، أو Kubernetes)، مع إبقاء المفتاح المحلي مؤقتاً، ثم يعيد تشغيل بيانيس.\n2. انقر **اختبار**، ثم **نقل … إلى HashiCorp Vault Transit**. تنتقل كل الأسرار المخزنة إلى Vault، ولا يحتاج أحد إلى إعادة إدخال كلمة مرور.\n3. عندما لا يعود أي سر يستخدم المفتاح المحلي، يزيله مسؤول الخادم.\n\nمع Vault، يُنشئ **تدوير المفتاح في Vault** إصداراً جديداً من المفتاح، وتجري إعادة التشفير داخل Vault، فلا تمر كلمات المرور عبر بيانيس. وإذا تعذّر الوصول إلى Vault، يستمر تسجيل الدخول بالحسابات المحلية، أما الاتصال بمصادر البيانات ومزودي الذكاء الاصطناعي فيفشل برسالة واضحة إلى أن يعود Vault.');

-- Human work on the old English is kept (marked out of date below), never overwritten.
CREATE TEMP TABLE _keep205 ON COMMIT DROP AS
SELECT tr.key_id FROM bayanat.translations tr
JOIN bayanat.translation_keys tk ON tk.key_id = tr.key_id
JOIN _tr205 n ON n.key_code = tk.key_code
WHERE tr.language_code = 'ar' AND tr.status_code IN ('HUMAN_EDITED', 'VERIFIED') AND tk.base_text <> n.base_text;

UPDATE bayanat.translations tr SET status_code = 'STALE'
FROM bayanat.translation_keys tk, _tr205 n
WHERE tr.key_id = tk.key_id AND tk.key_code = n.key_code AND tk.base_text <> n.base_text AND tr.status_code <> 'MISSING';

UPDATE bayanat.translation_keys tk SET base_text = n.base_text
FROM _tr205 n WHERE tk.key_code = n.key_code AND tk.base_text <> n.base_text;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'HELP_DOCS', key_code, base_text FROM _tr205
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr205 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE tk.key_id NOT IN (SELECT key_id FROM _keep205)
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED',
      model_ref_text = EXCLUDED.model_ref_text, translated_at = now(), verified_at = NULL, verified_by_user_id = NULL
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED')
     OR bayanat.translations.translated_text IS NULL;

COMMIT;
