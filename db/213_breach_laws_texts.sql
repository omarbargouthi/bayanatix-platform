-- 213: Arabic for the breach screens: Canada (PIPEDA, Law 25) and a notice per law (db/212). See db/174.
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_BREACH', 'Data Breaches', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr210 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr210 (key_code, category_code, base_text, ar_text) VALUES
  ('breach.desc', 'UI_BREACH', 'Record every suspected or confirmed breach of personal data, whether or not it has to be reported: what happened, which data and people it affects, the risk to them, the notice to the regulator under each law that applies, and the notice to the people concerned.', 'سجّل كل خرق مشتبه به أو مؤكد للبيانات الشخصية، سواء وجب الإبلاغ عنه أم لا: ما الذي حدث، وأي بيانات وأشخاص يمسّ، والخطر عليهم، وإشعار الجهة المختصة وفق كل نظام منطبق، وإبلاغ أصحاب البيانات.'),
  ('breach.reportHint', 'UI_BREACH', 'Report as soon as you suspect a breach: under PDPL and GDPR the regulator must be told within 72 hours of the organisation becoming aware, and Canadian laws require notice as soon as feasible. Details can be added later.', 'أبلغ فور اشتباهك بخرق: ففي نظام حماية البيانات الشخصية واللائحة الأوروبية يجب إشعار الجهة المختصة خلال 72 ساعة من علم الجهة به، وتشترط القوانين الكندية الإشعار في أقرب وقت ممكن. ويمكن إضافة التفاصيل لاحقاً.'),
  ('breach.discoveredHint', 'UI_BREACH', 'Notification deadlines run from this moment.', 'تبدأ مُهل الإشعار من هذه اللحظة.'),
  ('breach.regulations.PIPEDA', 'UI_BREACH', 'Canada PIPEDA', 'قانون PIPEDA الكندي'),
  ('breach.regulations.LAW25', 'UI_BREACH', 'Québec Law 25', 'قانون 25 في كيبك'),
  ('breach.authorityStates.NOTIFIED', 'UI_BREACH', 'Notified', 'تم الإشعار'),
  ('breach.authorityStates.ASAP', 'UI_BREACH', 'To notify as soon as feasible', 'يجب الإشعار في أقرب وقت ممكن'),
  ('breach.riskHelp.UNLIKELY', 'UI_BREACH', 'No notification needed under any law. Record why.', 'لا يلزم الإشعار وفق أي نظام. سجّل السبب.'),
  ('breach.riskHelp.RISK', 'UI_BREACH', 'Notify the regulator under PDPL and GDPR (72 hours). Canadian laws do not require notice at this level.', 'أشعر الجهة المختصة وفق نظام حماية البيانات الشخصية واللائحة الأوروبية (72 ساعة). ولا تشترط القوانين الكندية الإشعار عند هذا المستوى.'),
  ('breach.riskHelp.HIGH', 'UI_BREACH', 'Notify every regulator and the people concerned. Under PIPEDA this is a real risk of significant harm; under Law 25, a risk of serious injury.', 'أشعر كل جهة مختصة وأبلغ أصحاب البيانات. وهو في قانون PIPEDA «خطر حقيقي بضرر جسيم»، وفي قانون 25 «خطر إلحاق ضرر جدي».'),
  ('breach.deadlineDue', 'UI_BREACH', '{law}: notify {authority} by {date} ({left} left).', '{law}: أشعر {authority} قبل {date} (يتبقى {left}).'),
  ('breach.deadlineOverdue', 'UI_BREACH', '{law}: the deadline to notify {authority} passed on {date}, {late} ago. Notify now and record the reason for the delay.', '{law}: انقضت مهلة إشعار {authority} في {date}، قبل {late}. أشعرها الآن وسجّل سبب التأخير.'),
  ('breach.deadlineOnTime', 'UI_BREACH', '{law}: {authority} notified on {date}, within the deadline.', '{law}: تم إشعار {authority} في {date}، ضمن المهلة.'),
  ('breach.deadlineLate', 'UI_BREACH', '{law}: {authority} notified on {date}, {late} after the deadline.', '{law}: تم إشعار {authority} في {date}، بعد انقضاء المهلة بـ{late}.'),
  ('breach.deadlineNotRequired', 'UI_BREACH', '{law}: no notice needed at the assessed risk level.', '{law}: لا يلزم الإشعار عند مستوى الخطر المقيَّم.'),
  ('breach.deadlineAsap', 'UI_BREACH', '{law}: notify {authority} as soon as feasible.', '{law}: أشعر {authority} في أقرب وقت ممكن.'),
  ('breach.deadlineNotified', 'UI_BREACH', '{law}: {authority} notified on {date}.', '{law}: تم إشعار {authority} في {date}.'),
  ('breach.deadlineUnassessed', 'UI_BREACH', 'Until the risk is assessed, every regulator notice is treated as required.', 'إلى أن يُقيَّم الخطر، يُعامل كل إشعار للجهات المختصة على أنه مطلوب.'),
  ('breach.noticeNotRequired', 'UI_BREACH', 'Not required at the assessed risk level.', 'غير مطلوب عند مستوى الخطر المقيَّم.'),
  ('breach.missing.AUTHORITY', 'UI_BREACH', 'the notice to the regulator under {law}', 'إشعار الجهة المختصة وفق {law}'),
  ('breach.missing.LATE_REASON', 'UI_BREACH', 'the reason the notice under {law} was late', 'سبب تأخر الإشعار وفق {law}'),
  ('breach.errors.LAWS_REQUIRED', 'UI_BREACH', 'Choose at least one law.', 'اختر نظاماً واحداً على الأقل.'),
  ('breach.errors.LAW_NOTIFIED', 'UI_BREACH', 'The regulator was already notified under a law you are removing.', 'سبق إشعار الجهة المختصة وفق نظام تحاول إزالته.'),
  ('breach.lawRules.PDPL', 'UI_BREACH', 'Within 72 hours of becoming aware, for any risk to people (PDPL Implementing Regulation, art. 24).', 'خلال 72 ساعة من العلم بالخرق، عند وجود أي خطر على الأشخاص (اللائحة التنفيذية لنظام حماية البيانات الشخصية، المادة 24).'),
  ('breach.lawRules.GDPR', 'UI_BREACH', 'Within 72 hours of becoming aware, unless the breach is unlikely to result in a risk to people (GDPR art. 33).', 'خلال 72 ساعة من العلم بالخرق، ما لم يُستبعد أن يؤدي إلى خطر على الأشخاص (اللائحة الأوروبية، المادة 33).'),
  ('breach.lawRules.PIPEDA', 'UI_BREACH', 'As soon as feasible, when there is a real risk of significant harm (PIPEDA s. 10.1). Every breach must be recorded and kept for 24 months.', 'في أقرب وقت ممكن، عند وجود خطر حقيقي بضرر جسيم (قانون PIPEDA، المادة 10.1). ويجب تسجيل كل خرق والاحتفاظ بسجله 24 شهراً.'),
  ('breach.lawRules.LAW25', 'UI_BREACH', 'Promptly, when there is a risk of serious injury (Private Sector Act, s. 3.5). Every incident must be kept in the register for at least 5 years.', 'على وجه السرعة، عند وجود خطر إلحاق ضرر جدي (قانون القطاع الخاص، المادة 3.5). ويجب حفظ كل حادث في السجل 5 سنوات على الأقل.'),
  ('breach.authorities.PDPL', 'UI_BREACH', 'SDAIA (Saudi Data & AI Authority)', 'الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا)'),
  ('breach.authorities.GDPR', 'UI_BREACH', 'Lead supervisory authority', 'السلطة الإشرافية الرئيسية'),
  ('breach.authorities.PIPEDA', 'UI_BREACH', 'Office of the Privacy Commissioner of Canada (OPC)', 'مكتب مفوض الخصوصية في كندا (OPC)'),
  ('breach.authorities.LAW25', 'UI_BREACH', 'Commission d''accès à l''information du Québec (CAI)', 'لجنة الوصول إلى المعلومات في كيبك (CAI)'),
  ('breach.authorityStates.ON_TIME', 'UI_BREACH', 'Notified on time', 'تم الإشعار في الموعد'),
  ('breach.authorityStates.LATE', 'UI_BREACH', 'Notified late', 'تم الإشعار متأخراً');

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
