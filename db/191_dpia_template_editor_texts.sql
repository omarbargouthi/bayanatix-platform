-- 191: Arabic for the impact assessment questionnaire editor. See db/174 and db/187.
-- Safe to run more than once.

BEGIN;

CREATE TEMP TABLE _tr191 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr191 (key_code, category_code, base_text, ar_text) VALUES
  ('dpiaTemplates.open', 'UI_DPIA', 'Questionnaires', 'الاستبيانات'),
  ('dpiaTemplates.title', 'UI_DPIA', 'Questionnaires', 'الاستبيانات'),
  ('dpiaTemplates.desc', 'UI_DPIA', 'The screening and assessment questions each impact assessment follows.', 'أسئلة الفحص الأولي والتقييم التي يتبعها كل تقييم أثر.'),
  ('dpiaTemplates.editNote', 'UI_DPIA', 'Changes apply to assessments that are not yet decided. Decided versions keep the questions they were decided on.', 'تسري التغييرات على التقييمات التي لم يُبت فيها بعد. وتحتفظ الإصدارات المعتمدة بالأسئلة التي صدر القرار بناءً عليها.'),
  ('dpiaTemplates.newTemplate', 'UI_DPIA', '+ New questionnaire', '+ استبيان جديد'),
  ('dpiaTemplates.newTitle', 'UI_DPIA', 'New questionnaire', 'استبيان جديد'),
  ('dpiaTemplates.startFrom', 'UI_DPIA', 'Start from', 'البدء من'),
  ('dpiaTemplates.startEmpty', 'UI_DPIA', 'An empty questionnaire', 'استبيان فارغ'),
  ('dpiaTemplates.copyOf', 'UI_DPIA', 'A copy of {name}', 'نسخة من {name}'),
  ('dpiaTemplates.newHint', 'UI_DPIA', 'The new questionnaire is not offered for new assessments until you switch it on.', 'لا يُتاح الاستبيان الجديد للتقييمات الجديدة حتى تفعّله.'),
  ('dpiaTemplates.create', 'UI_DPIA', 'Create', 'إنشاء'),
  ('dpiaTemplates.fName', 'UI_DPIA', 'Name', 'الاسم'),
  ('dpiaTemplates.fRegulation', 'UI_DPIA', 'Regulation', 'النظام'),
  ('dpiaTemplates.fDescription', 'UI_DPIA', 'Description', 'الوصف'),
  ('dpiaTemplates.inEnglish', 'UI_DPIA', 'English', 'بالإنجليزية'),
  ('dpiaTemplates.inArabic', 'UI_DPIA', 'Arabic', 'بالعربية'),
  ('dpiaTemplates.arStale', 'UI_DPIA', 'The English changed after this Arabic was written', 'تغيّر النص الإنجليزي بعد كتابة هذه الترجمة'),
  ('dpiaTemplates.arMissing', 'UI_DPIA', 'No Arabic yet', 'لا توجد ترجمة عربية بعد'),
  ('dpiaTemplates.fThreshold', 'UI_DPIA', 'Screening threshold', 'حد الفحص الأولي'),
  ('dpiaTemplates.thresholdHint', 'UI_DPIA', 'An assessment is required when at least this many screening questions are answered Yes.', 'يلزم إجراء تقييم عندما تكون الإجابة «نعم» عن هذا العدد على الأقل من أسئلة الفحص الأولي.'),
  ('dpiaTemplates.fActive', 'UI_DPIA', 'Offered for new assessments', 'متاح للتقييمات الجديدة'),
  ('dpiaTemplates.fDefault', 'UI_DPIA', 'Default for new assessments', 'الافتراضي للتقييمات الجديدة'),
  ('dpiaTemplates.badgeDefault', 'UI_DPIA', 'Default', 'افتراضي'),
  ('dpiaTemplates.badgeInactive', 'UI_DPIA', 'Not offered', 'غير متاح'),
  ('dpiaTemplates.counts', 'UI_DPIA', '{s} screening · {a} assessment questions', '{s} سؤال فحص · {a} سؤال تقييم'),
  ('dpiaTemplates.usedBy', 'UI_DPIA', 'Used by {n} assessment(s), {open} not yet decided', 'مستخدم في {n} تقييم، منها {open} لم يُبت فيها بعد'),
  ('dpiaTemplates.notUsed', 'UI_DPIA', 'Not used by any assessment yet', 'لم يُستخدم في أي تقييم بعد'),
  ('dpiaTemplates.updated', 'UI_DPIA', 'Last changed by {user} on {date}', 'آخر تعديل بواسطة {user} في {date}'),
  ('dpiaTemplates.saved', 'UI_DPIA', 'Saved.', 'تم الحفظ.'),
  ('dpiaTemplates.deleteTemplate', 'UI_DPIA', 'Delete questionnaire', 'حذف الاستبيان'),
  ('dpiaTemplates.deleteConfirm', 'UI_DPIA', 'Delete this questionnaire and its questions?', 'هل تريد حذف هذا الاستبيان وأسئلته؟'),
  ('dpiaTemplates.screeningTitle', 'UI_DPIA', 'Screening questions', 'أسئلة الفحص الأولي'),
  ('dpiaTemplates.screeningDesc', 'UI_DPIA', 'Answered Yes or No. Every one must be answered before the screening is decided.', 'يُجاب عنها بنعم أو لا، ويجب الإجابة عنها جميعاً قبل البت في الفحص الأولي.'),
  ('dpiaTemplates.assessmentTitle', 'UI_DPIA', 'Assessment questions', 'أسئلة التقييم'),
  ('dpiaTemplates.assessmentDesc', 'UI_DPIA', 'Answered in writing. When a question is linked to the catalog, its facts are shown beside it.', 'يُجاب عنها كتابةً. وإذا رُبط السؤال بالفهرس تظهر حقائقه بجانبه.'),
  ('dpiaTemplates.addQuestion', 'UI_DPIA', '+ Add question', '+ إضافة سؤال'),
  ('dpiaTemplates.noQuestions', 'UI_DPIA', 'No questions yet.', 'لا توجد أسئلة بعد.'),
  ('dpiaTemplates.editQuestion', 'UI_DPIA', 'Edit question', 'تعديل السؤال'),
  ('dpiaTemplates.newQuestion', 'UI_DPIA', 'New question', 'سؤال جديد'),
  ('dpiaTemplates.fStage', 'UI_DPIA', 'Stage', 'المرحلة'),
  ('dpiaTemplates.stages.SCREENING', 'UI_DPIA', 'Screening', 'الفحص الأولي'),
  ('dpiaTemplates.stages.ASSESSMENT', 'UI_DPIA', 'Assessment', 'التقييم'),
  ('dpiaTemplates.fSection', 'UI_DPIA', 'Section', 'القسم'),
  ('dpiaTemplates.fText', 'UI_DPIA', 'Question', 'السؤال'),
  ('dpiaTemplates.fHelp', 'UI_DPIA', 'Guidance', 'إرشاد'),
  ('dpiaTemplates.fReference', 'UI_DPIA', 'Legal reference', 'المرجع النظامي'),
  ('dpiaTemplates.fAuto', 'UI_DPIA', 'Catalog link', 'الربط بالفهرس'),
  ('dpiaTemplates.autoNone', 'UI_DPIA', 'None', 'لا يوجد'),
  ('dpiaTemplates.autoHintScreening', 'UI_DPIA', 'The screening shows “the catalog suggests Yes” when the catalog has this finding.', 'يعرض الفحص الأولي «يقترح الفهرس الإجابة بنعم» عندما يتضمن الفهرس هذه الملاحظة.'),
  ('dpiaTemplates.autoHintAssessment', 'UI_DPIA', 'These catalog facts are shown under the question, ready to copy into the answer.', 'تظهر حقائق الفهرس هذه تحت السؤال، جاهزة للنسخ إلى الإجابة.'),
  ('dpiaTemplates.autoFlags.SENSITIVE_PI', 'UI_DPIA', 'Sensitive personal data', 'بيانات شخصية حساسة'),
  ('dpiaTemplates.autoFlags.LARGE_SCALE', 'UI_DPIA', 'Large scale', 'نطاق واسع'),
  ('dpiaTemplates.autoFlags.MULTI_SOURCE', 'UI_DPIA', 'Held in or flowing across several systems', 'موجودة في عدة أنظمة أو تنتقل بينها'),
  ('dpiaTemplates.autoFlags.EXTERNAL_SHARING', 'UI_DPIA', 'Shared outside the organisation', 'مشاركة خارج الجهة'),
  ('dpiaTemplates.autoFlags.CROSS_BORDER', 'UI_DPIA', 'Transferred outside the country', 'نقل إلى خارج الدولة'),
  ('dpiaTemplates.autoFlags.UNENCRYPTED_PI', 'UI_DPIA', 'Personal data not marked as encrypted', 'بيانات شخصية غير موسومة بالتشفير'),
  ('dpiaTemplates.autoFlags.NO_RETENTION', 'UI_DPIA', 'No retention category', 'بلا فئة احتفاظ'),
  ('dpiaTemplates.autoFlags.DOWNSTREAM_UNCLASSIFIED', 'UI_DPIA', 'Unclassified downstream copies', 'نسخ لاحقة غير مصنّفة'),
  ('dpiaTemplates.catalogSuggests', 'UI_DPIA', 'Catalog suggests Yes: {what}', 'يقترح الفهرس نعم: {what}'),
  ('dpiaTemplates.catalogShows', 'UI_DPIA', 'Shows: {what}', 'يعرض: {what}'),
  ('dpiaTemplates.fRequired', 'UI_DPIA', 'Must be answered before the assessment is sent for review', 'يجب الإجابة عنه قبل إرسال التقييم للمراجعة'),
  ('dpiaTemplates.required', 'UI_DPIA', 'Required', 'إلزامي'),
  ('dpiaTemplates.answeredN', 'UI_DPIA', 'Answered in {n} assessment(s)', 'أُجيب عنه في {n} تقييم'),
  ('dpiaTemplates.up', 'UI_DPIA', 'Move up', 'تحريك لأعلى'),
  ('dpiaTemplates.down', 'UI_DPIA', 'Move down', 'تحريك لأسفل'),
  ('dpiaTemplates.remove', 'UI_DPIA', 'Remove', 'إزالة'),
  ('dpiaTemplates.removeConfirm', 'UI_DPIA', 'Remove this question? If assessments have answered it, it is retired instead: they keep the answer and new assessments no longer ask it.', 'هل تريد إزالة هذا السؤال؟ إذا أُجيب عنه في تقييمات فسيُوقف بدلاً من حذفه: تحتفظ التقييمات بالإجابة ولا يُطرح في التقييمات الجديدة.'),
  ('dpiaTemplates.removed', 'UI_DPIA', 'The question is removed.', 'أُزيل السؤال.'),
  ('dpiaTemplates.retired', 'UI_DPIA', 'The question is no longer asked. Assessments that answered it keep the answer.', 'لم يعد السؤال يُطرح، وتحتفظ التقييمات التي أجابت عنه بالإجابة.'),
  ('dpiaTemplates.retiredTitle', 'UI_DPIA', 'No longer asked', 'لم تعد تُطرح'),
  ('dpiaTemplates.restore', 'UI_DPIA', 'Ask again', 'إعادة طرحه'),
  ('dpiaTemplates.stageLockedNote', 'UI_DPIA', 'Assessments have answered this question, so it stays in its stage.', 'أُجيب عن هذا السؤال في تقييمات، لذا يبقى في مرحلته.'),
  ('dpiaTemplates.errors.NAME_REQUIRED', 'UI_DPIA', 'A name is required.', 'الاسم مطلوب.'),
  ('dpiaTemplates.errors.THRESHOLD_INVALID', 'UI_DPIA', 'The threshold must be at least 1.', 'يجب ألا يقل الحد عن 1.'),
  ('dpiaTemplates.errors.THRESHOLD_TOO_HIGH', 'UI_DPIA', 'The threshold cannot be higher than the number of screening questions.', 'لا يمكن أن يتجاوز الحد عدد أسئلة الفحص الأولي.'),
  ('dpiaTemplates.errors.DEFAULT_REQUIRED', 'UI_DPIA', 'Make another questionnaire the default instead.', 'اجعل استبياناً آخر هو الافتراضي بدلاً من ذلك.'),
  ('dpiaTemplates.errors.NO_SCREENING_QUESTIONS', 'UI_DPIA', 'Add at least one screening question before offering this questionnaire.', 'أضف سؤال فحص أولي واحداً على الأقل قبل إتاحة هذا الاستبيان.'),
  ('dpiaTemplates.errors.TEMPLATE_IN_USE', 'UI_DPIA', 'Assessments use this questionnaire. Take it out of use instead of deleting it.', 'تستخدم تقييماتٌ هذا الاستبيان. أوقف إتاحته بدلاً من حذفه.'),
  ('dpiaTemplates.errors.STAGE_INVALID', 'UI_DPIA', 'Choose a stage.', 'اختر المرحلة.'),
  ('dpiaTemplates.errors.SECTION_INVALID', 'UI_DPIA', 'Choose a section.', 'اختر القسم.'),
  ('dpiaTemplates.errors.TEXT_REQUIRED', 'UI_DPIA', 'The question needs a text.', 'يجب كتابة نص السؤال.'),
  ('dpiaTemplates.errors.AUTO_INVALID', 'UI_DPIA', 'Unknown catalog link.', 'ربط غير معروف بالفهرس.'),
  ('dpiaTemplates.errors.STAGE_LOCKED', 'UI_DPIA', 'Assessments have answered this question, so it stays in its stage.', 'أُجيب عن هذا السؤال في تقييمات، لذا يبقى في مرحلته.');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr191
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr191 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
