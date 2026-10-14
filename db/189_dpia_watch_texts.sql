-- 189: Arabic for keeping impact assessments current: suggestions, catalog changes since
-- an outcome, and the related history entries and messages. See db/174 and db/187.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr189 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr189 (key_code, category_code, base_text, ar_text) VALUES
  ('dpiaWatch.suggestionsTitle', 'UI_DPIA', 'Assessments to consider', 'تقييمات يُنصح بها'),
  ('dpiaWatch.suggestionsDesc', 'UI_DPIA', 'Personal data that the catalog says needs a screening and that no assessment covers yet. Checked daily.', 'بيانات شخصية يشير الفهرس إلى حاجتها إلى فحص أولي ولا يغطيها أي تقييم بعد. يُجرى التحقق يومياً.'),
  ('dpiaWatch.lastChecked', 'UI_DPIA', 'Last checked {date}', 'آخر تحقق {date}'),
  ('dpiaWatch.neverChecked', 'UI_DPIA', 'Not checked yet', 'لم يُجرَ التحقق بعد'),
  ('dpiaWatch.checkNow', 'UI_DPIA', 'Check now', 'تحقّق الآن'),
  ('dpiaWatch.checking', 'UI_DPIA', 'Checking…', 'جارٍ التحقق…'),
  ('dpiaWatch.checkedResult', 'UI_DPIA', 'Checked: {added} new suggestion(s), {changed} assessment(s) with catalog changes.', 'تم التحقق: {added} اقتراح جديد، و{changed} تقييم تغيّرت حقائقه في الفهرس.'),
  ('dpiaWatch.noSuggestions', 'UI_DPIA', 'Nothing to consider: every asset that needs a screening is covered by an assessment.', 'لا شيء يستدعي الانتباه: كل أصل يحتاج إلى فحص أولي يشمله تقييم.'),
  ('dpiaWatch.showDismissed', 'UI_DPIA', 'Show dismissed ({n})', 'عرض المستبعدة ({n})'),
  ('dpiaWatch.hideDismissed', 'UI_DPIA', 'Hide dismissed', 'إخفاء المستبعدة'),
  ('dpiaWatch.start', 'UI_DPIA', 'Start screening', 'بدء الفحص'),
  ('dpiaWatch.dismiss', 'UI_DPIA', 'Dismiss', 'استبعاد'),
  ('dpiaWatch.restore', 'UI_DPIA', 'Restore', 'استعادة'),
  ('dpiaWatch.dismissTitle', 'UI_DPIA', 'Dismiss the suggestion', 'استبعاد الاقتراح'),
  ('dpiaWatch.dismissHint', 'UI_DPIA', 'Say why no screening is needed. The suggestion comes back if the catalog finds a new reason.', 'اذكر سبب عدم الحاجة إلى فحص أولي. يعود الاقتراح إذا وجد الفهرس سبباً جديداً.'),
  ('dpiaWatch.dismissedBy', 'UI_DPIA', 'Dismissed by {user} on {date}', 'استبعده {user} في {date}'),
  ('dpiaWatch.since', 'UI_DPIA', 'Since {date}', 'منذ {date}'),
  ('dpiaWatch.reasons.SENSITIVE_PI', 'UI_DPIA', '{n} column(s) with sensitive personal data', '{n} عمود يحتوي بيانات شخصية حساسة'),
  ('dpiaWatch.reasons.LARGE_SCALE', 'UI_DPIA', 'About {n} rows of personal data', 'نحو {n} صف من البيانات الشخصية'),
  ('dpiaWatch.reasons.EXTERNAL_SHARING', 'UI_DPIA', 'Shared outside the organisation with {detail}', 'تُشارك خارج الجهة مع {detail}'),
  ('dpiaWatch.reasons.CROSS_BORDER', 'UI_DPIA', 'Transferred outside the country', 'تُنقل إلى خارج الدولة'),
  ('dpiaWatch.reasons.PROCESSES_PI', 'UI_DPIA', 'Processes {n} personal data column(s)', 'يعالج {n} عمود بيانات شخصية'),
  ('dpiaWatch.kpiChanged', 'UI_DPIA', 'Catalog changed', 'تغيّر الفهرس'),
  ('dpiaWatch.filterChanged', 'UI_DPIA', 'Catalog changed since the outcome', 'تغيّر الفهرس منذ النتيجة'),
  ('dpiaWatch.changedBadge', 'UI_DPIA', 'Catalog changed', 'تغيّر الفهرس'),
  ('dpiaWatch.bannerTitle.NOT_REQUIRED', 'UI_DPIA', 'The catalog has changed since this was screened', 'تغيّر الفهرس منذ إجراء الفحص الأولي'),
  ('dpiaWatch.bannerTitle.IN_REVIEW', 'UI_DPIA', 'The catalog has changed since this was sent for review', 'تغيّر الفهرس منذ إرسال التقييم للمراجعة'),
  ('dpiaWatch.bannerTitle.DECIDED', 'UI_DPIA', 'The catalog has changed since this was decided', 'تغيّر الفهرس منذ صدور القرار'),
  ('dpiaWatch.bannerHint', 'UI_DPIA', 'Found on {date}. Reopen the assessment to bring it up to date, or record that the changes do not alter it.', 'رُصد في {date}. أعد فتح التقييم لتحديثه، أو سجّل أن التغييرات لا تؤثر فيه.'),
  ('dpiaWatch.bannerHintReview', 'UI_DPIA', 'Found on {date}. Return the assessment for changes, or record that the changes do not alter it.', 'رُصد في {date}. أعد التقييم لإجراء التعديلات، أو سجّل أن التغييرات لا تؤثر فيه.'),
  ('dpiaWatch.ackButton', 'UI_DPIA', 'Not material', 'غير جوهرية'),
  ('dpiaWatch.ackTitle', 'UI_DPIA', 'The changes do not alter the assessment', 'التغييرات لا تؤثر في التقييم'),
  ('dpiaWatch.ackHint', 'UI_DPIA', 'Say why. The catalog as it is now becomes the point of comparison for later checks.', 'اذكر السبب. يصبح الفهرس بحالته الحالية مرجع المقارنة في عمليات التحقق اللاحقة.'),
  ('dpiaWatch.acknowledged', 'UI_DPIA', 'Recorded. Later checks compare with the catalog as it is now.', 'تم التسجيل. تُقارن عمليات التحقق اللاحقة بالفهرس بحالته الحالية.'),
  ('dpiaWatch.changes.NEW_PI_COLUMNS', 'UI_DPIA', '{n} new personal data column(s)', '{n} عمود بيانات شخصية جديد'),
  ('dpiaWatch.changes.NEW_SENSITIVE', 'UI_DPIA', 'New sensitive personal data', 'بيانات شخصية حساسة جديدة'),
  ('dpiaWatch.changes.NEW_FINDING', 'UI_DPIA', 'New finding: {finding}', 'ملاحظة جديدة: {finding}'),
  ('dpiaWatch.changes.NEW_SHARING', 'UI_DPIA', '{n} new sharing agreement(s)', '{n} اتفاقية مشاركة جديدة'),
  ('dpiaWatch.changes.NEW_SYSTEMS', 'UI_DPIA', 'Personal data now reaches {n} more system(s)', 'أصبحت البيانات الشخصية تصل إلى {n} نظام إضافي'),
  ('dpiaWatch.changes.SUBJECT_CHANGED', 'UI_DPIA', 'The subject''s details changed', 'تغيّرت بيانات الموضوع'),
  ('dpiaWatch.changes.ASSET_REMOVED', 'UI_DPIA', '{n} linked asset(s) no longer exist', '{n} أصل مرتبط لم يعد موجوداً'),
  ('dpiaWatch.assetSuggested', 'UI_DPIA', 'The catalog suggests an impact assessment for this:', 'يقترح الفهرس إجراء تقييم أثر لهذا:'),
  ('dpia.events.CHANGES_DETECTED', 'UI_DPIA', 'The catalog changed', 'تغيّر الفهرس'),
  ('dpia.events.CHANGES_ACKNOWLEDGED', 'UI_DPIA', 'Catalog changes judged not material', 'اعتُبرت تغييرات الفهرس غير جوهرية'),
  ('dpia.errors.NO_CHANGES', 'UI_DPIA', 'No change is waiting to be looked at.', 'لا يوجد تغيير بانتظار النظر فيه.'),
  ('dpia.errors.SUGGESTION_NOT_FOUND', 'UI_DPIA', 'This suggestion is no longer open.', 'لم يعد هذا الاقتراح قائماً.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr189
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr189 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
