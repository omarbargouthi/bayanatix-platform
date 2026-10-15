-- 216: Arabic for the breach screens: Ontario PHIPA, and links to the compliance frameworks (db/215). See db/174.
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_BREACH', 'Data Breaches', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr210 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr210 (key_code, category_code, base_text, ar_text) VALUES
  ('breach.regulations.PHIPA', 'UI_BREACH', 'Ontario PHIPA', 'قانون PHIPA في أونتاريو'),
  ('breach.authorities.PHIPA', 'UI_BREACH', 'Information and Privacy Commissioner of Ontario (IPC)', 'مفوض المعلومات والخصوصية في أونتاريو (IPC)'),
  ('breach.lawRules.PHIPA', 'UI_BREACH', 'Report to the Commissioner in the circumstances the regulation sets out, such as theft, a significant breach or a pattern of similar breaches (O. Reg. 329/04, s. 6.3). Every breach is also counted in the annual report to the Commissioner.', 'أبلغ المفوض في الحالات التي تحددها اللائحة، مثل السرقة أو الخرق الجسيم أو تكرار خروقات مماثلة (اللائحة 329/04، المادة 6.3). ويُحتسب كل خرق كذلك في التقرير السنوي إلى المفوض.'),
  ('breach.riskHelp.UNLIKELY', 'UI_BREACH', 'No regulator notice needed. Record why. Under PHIPA, the people concerned must still be told.', 'لا يلزم إشعار الجهات المختصة. سجّل السبب. وفي قانون PHIPA يجب مع ذلك إبلاغ أصحاب البيانات.'),
  ('breach.subjAlways', 'UI_BREACH', 'Required under {laws} whatever the risk, at the first reasonable opportunity.', 'مطلوب وفق {laws} أياً كان الخطر، في أول فرصة معقولة.'),
  ('breach.frameworkLink', 'UI_BREACH', 'Compliance framework: {name}', 'إطار الامتثال: {name}'),
  ('breach.missing.LAWS', 'UI_BREACH', 'the laws that apply', 'الأنظمة المنطبقة');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr210
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr210 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
