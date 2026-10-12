-- 174: Arabic for the screens changed in db/172-173 and the request rework.
-- The application's Arabic is read from bayanat.translations, not from lib/i18n/ar.ts
-- (that file is only the starter pack, loaded by scripts/seed-translation-keys.mts). So
-- text added or reworded in lib/i18n/en.ts needs its key and its Arabic here as well:
--   * the attachment list and its previews (new section "attachments");
--   * "New Request" (was "Request Access") and the new request-type texts;
--   * the FOI amounts, where the Arabic still said "ريال" instead of the configured
--     currency, and so ignored the FOI currency setting (db/172).
-- A reworded English text replaces its Arabic with the one from lib/i18n/ar.ts, since
-- the old translation no longer matches; a translation of it in any other language is
-- marked STALE for review, as the seed script does.
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code)
VALUES ('UI_ATTACHMENTS', 'Attachments', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr174 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr174 (key_code, category_code, base_text, ar_text) VALUES
  ('nav.requestAccess', 'UI_NAV', 'New Request', 'طلب جديد'),
  ('requestAccess.pageTitle', 'UI_REQUESTACCESS', 'New Request', 'طلب جديد'),
  ('requestAccess.pageDesc', 'UI_REQUESTACCESS', 'Raise a request about a data asset, or ask for access to a data source, schema, table, or feature domain.', 'قدّم طلباً بخصوص أصل بيانات، أو اطلب صلاحية الوصول إلى مصدر بيانات أو مخطط أو جدول أو أحد المجالات الوظيفية.'),
  ('requestAccess.tabMyRequests', 'UI_REQUESTACCESS', 'All Requests', 'جميع الطلبات'),
  ('requestAccess.assetRequestSubmitted', 'UI_REQUESTACCESS', 'Request submitted. It now follows its workflow.', 'تم إرسال الطلب، وسيتبع مسار العمل الخاص به.'),
  ('requestAccess.viewAssetRequests', 'UI_REQUESTACCESS', 'View in Requests', 'عرض في الطلبات'),
  ('catalog.requestAccessBtn', 'UI_CATALOG', 'New Request', 'طلب جديد'),
  ('catalog.raiseRequestTitle', 'UI_CATALOG', 'New Request', 'طلب جديد'),
  ('catalog.reqTypeAccess', 'UI_CATALOG', 'Access', 'صلاحية وصول'),
  ('catalog.reqTypeAccessDesc', 'UI_CATALOG', 'Access to a data source, schema, or table, or to a feature domain', 'الوصول إلى مصدر بيانات أو مخطط أو جدول، أو إلى أحد المجالات الوظيفية'),
  ('catalog.targetPickerHint', 'UI_CATALOG', 'Choose the data source this request is about, and optionally a schema or table in it.', 'اختر مصدر البيانات الذي يتعلق به الطلب، ويمكنك تحديد مخطط أو جدول ضمنه.'),
  ('foi.assessment.exemptZeroCost', 'UI_FOI', '{currency} 0.00 — Payment exempted', '0.00 {currency} — تم إعفاء الرسوم'),
  ('foi.assessment.perDay', 'UI_FOI', '× {currency} {rate} / day', '× {rate} {currency} / يوم'),
  ('foi.assessment.receivedSoFar', 'UI_FOI', 'Received so far: {currency} {amount}.', 'المستلم حتى الآن: {amount} {currency}.'),
  ('foi.assessment.overrideAmountLabel', 'UI_FOI', 'Override Amount ({currency})', 'المبلغ المُعدَّل ({currency})'),
  ('foi.assessment.finalAmountExempt', 'UI_FOI', '{currency} 0.00 (Exempt)', '0.00 {currency} (معفى)'),
  ('foi.payments.amountLabel', 'UI_FOI', 'Amount ({currency})', 'المبلغ ({currency})'),
  ('foi.public.intake.formatSarAmount', 'UI_FOI', 'Monetary Amount', 'مبلغ مالي'),
  ('attachments.loading', 'UI_ATTACHMENTS', 'Loading…', 'جارٍ التحميل…'),
  ('attachments.listLoadFailed', 'UI_ATTACHMENTS', 'The list could not be loaded.', 'تعذّر تحميل القائمة.'),
  ('attachments.docLoadFailed', 'UI_ATTACHMENTS', 'The document could not be loaded.', 'تعذّر تحميل المستند.'),
  ('attachments.textTruncated', 'UI_ATTACHMENTS', '… (the rest is not shown; download the document to see all of it)', '… (لم يُعرض الباقي؛ نزّل المستند للاطلاع عليه كاملاً)'),
  ('attachments.addDocuments', 'UI_ATTACHMENTS', '+ Add documents', '+ إضافة مستندات'),
  ('attachments.addLinks', 'UI_ATTACHMENTS', '+ Add links', '+ إضافة روابط'),
  ('attachments.addDocumentsTitle', 'UI_ATTACHMENTS', 'Add documents', 'إضافة مستندات'),
  ('attachments.addLinksTitle', 'UI_ATTACHMENTS', 'Add links', 'إضافة روابط'),
  ('attachments.nothingAttached', 'UI_ATTACHMENTS', 'Nothing attached yet.', 'لا توجد مرفقات بعد.'),
  ('attachments.chooseDocsErr', 'UI_ATTACHMENTS', 'Choose one or more documents to upload.', 'اختر مستنداً واحداً أو أكثر لرفعه.'),
  ('attachments.enterLinkErr', 'UI_ATTACHMENTS', 'Enter at least one link.', 'أدخل رابطاً واحداً على الأقل.'),
  ('attachments.titleEmptyErr', 'UI_ATTACHMENTS', 'The title cannot be empty.', 'لا يمكن ترك العنوان فارغاً.'),
  ('attachments.genericErr', 'UI_ATTACHMENTS', 'That did not work. Try again.', 'لم تنجح العملية. حاول مرة أخرى.'),
  ('attachments.serverUnreachable', 'UI_ATTACHMENTS', 'The server could not be reached.', 'تعذّر الوصول إلى الخادم.'),
  ('attachments.uploadingN', 'UI_ATTACHMENTS', 'Uploading {n} of {total}…', 'جارٍ رفع {n} من {total}…'),
  ('attachments.addingN', 'UI_ATTACHMENTS', 'Adding {n} of {total}…', 'جارٍ إضافة {n} من {total}…'),
  ('attachments.failedSummary', 'UI_ATTACHMENTS', '{failed} of {total} could not be added: {list}', 'تعذّرت إضافة {failed} من {total}: {list}'),
  ('attachments.removeConfirm', 'UI_ATTACHMENTS', 'Remove “{title}” from {from}?', 'هل تريد إزالة «{title}» من {from}؟'),
  ('attachments.removeFileNote', 'UI_ATTACHMENTS', ' The stored document is deleted.', ' سيُحذف المستند المخزَّن.'),
  ('attachments.documentsLabel', 'UI_ATTACHMENTS', 'Documents', 'المستندات'),
  ('attachments.replaceLabel', 'UI_ATTACHMENTS', 'Replace the document (optional)', 'استبدال المستند (اختياري)'),
  ('attachments.sizeOne', 'UI_ATTACHMENTS', 'Up to 25 MB.', 'حتى 25 ميغابايت.'),
  ('attachments.sizeMany', 'UI_ATTACHMENTS', 'Choose one or several, up to 25 MB each.', 'اختر ملفاً واحداً أو عدة ملفات، حتى 25 ميغابايت لكل ملف.'),
  ('attachments.previewTypesHint', 'UI_ATTACHMENTS', 'PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), images and text files are previewed here; other types (.doc, .ppt, .xls…) are downloaded.', 'تُعرض هنا معاينة ملفات PDF و Word (.docx) و PowerPoint (.pptx) و Excel (.xlsx) والصور والملفات النصية؛ أما الأنواع الأخرى (.doc و .ppt و .xls…) فيجري تنزيلها.'),
  ('attachments.linkLabel', 'UI_ATTACHMENTS', 'Link', 'الرابط'),
  ('attachments.linksLabel', 'UI_ATTACHMENTS', 'Links', 'الروابط'),
  ('attachments.linkHintOne', 'UI_ATTACHMENTS', 'The address of a page in Bayanis, or any http(s) address such as an intranet page.', 'عنوان صفحة في بيانس، أو أي عنوان http(s) مثل صفحة على الشبكة الداخلية.'),
  ('attachments.linkHintMany', 'UI_ATTACHMENTS', 'One per line: the address of a page in Bayanis, or any http(s) address such as an intranet page.', 'رابط واحد في كل سطر: عنوان صفحة في بيانس، أو أي عنوان http(s) مثل صفحة على الشبكة الداخلية.'),
  ('attachments.titleLabel', 'UI_ATTACHMENTS', 'Title', 'العنوان'),
  ('attachments.titleFilePlaceholder', 'UI_ATTACHMENTS', 'Defaults to the file name', 'الافتراضي هو اسم الملف'),
  ('attachments.titleLinkPlaceholder', 'UI_ATTACHMENTS', 'Defaults to the link', 'الافتراضي هو الرابط'),
  ('attachments.noteLabel', 'UI_ATTACHMENTS', 'Note (optional)', 'ملاحظة (اختياري)'),
  ('attachments.noteAllSuffix', 'UI_ATTACHMENTS', ' — applied to all of them', ' — تُطبَّق عليها جميعاً'),
  ('attachments.notePlaceholder', 'UI_ATTACHMENTS', 'What this shows, which section or page', 'ما الذي يوضّحه هذا المرفق، وأي قسم أو صفحة'),
  ('attachments.titledByFile', 'UI_ATTACHMENTS', 'Each one is titled by its file name; titles can be edited afterwards.', 'يُعنوَن كل مستند باسم ملفه؛ ويمكن تعديل العناوين لاحقاً.'),
  ('attachments.titledByLink', 'UI_ATTACHMENTS', 'Each one is titled by its address; titles can be edited afterwards.', 'يُعنوَن كل رابط بعنوانه؛ ويمكن تعديل العناوين لاحقاً.'),
  ('attachments.bayanisPage', 'UI_ATTACHMENTS', 'Bayanis page', 'صفحة في بيانس'),
  ('attachments.externalLink', 'UI_ATTACHMENTS', 'External link', 'رابط خارجي'),
  ('attachments.addedOn', 'UI_ATTACHMENTS', 'Added on {date}', 'أُضيف بتاريخ {date}'),
  ('attachments.addedByOn', 'UI_ATTACHMENTS', 'Added by {user} on {date}', 'أضافه {user} بتاريخ {date}'),
  ('attachments.editedOn', 'UI_ATTACHMENTS', ' · edited {date}', ' · عُدّل بتاريخ {date}'),
  ('attachments.editedByOn', 'UI_ATTACHMENTS', ' · edited {date} by {user}', ' · عدّله {user} بتاريخ {date}'),
  ('attachments.preview', 'UI_ATTACHMENTS', 'Preview', 'معاينة'),
  ('attachments.download', 'UI_ATTACHMENTS', 'Download', 'تنزيل'),
  ('attachments.open', 'UI_ATTACHMENTS', 'Open', 'فتح'),
  ('attachments.edit', 'UI_ATTACHMENTS', 'Edit', 'تعديل'),
  ('attachments.remove', 'UI_ATTACHMENTS', 'Remove', 'إزالة'),
  ('attachments.cancel', 'UI_ATTACHMENTS', 'Cancel', 'إلغاء'),
  ('attachments.save', 'UI_ATTACHMENTS', 'Save', 'حفظ'),
  ('attachments.saving', 'UI_ATTACHMENTS', 'Saving…', 'جارٍ الحفظ…'),
  ('attachments.upload', 'UI_ATTACHMENTS', 'Upload', 'رفع'),
  ('attachments.uploadN', 'UI_ATTACHMENTS', 'Upload {n} documents', 'رفع {n} مستندات'),
  ('attachments.addLink', 'UI_ATTACHMENTS', 'Add link', 'إضافة الرابط'),
  ('attachments.addLinksN', 'UI_ATTACHMENTS', 'Add {n} links', 'إضافة {n} روابط'),
  ('attachments.openNewTab', 'UI_ATTACHMENTS', 'Open in a new tab', 'فتح في تبويب جديد'),
  ('attachments.close', 'UI_ATTACHMENTS', 'Close', 'إغلاق'),
  ('attachments.cannotPreview', 'UI_ATTACHMENTS', 'This type of document cannot be shown in the browser.', 'لا يمكن عرض هذا النوع من المستندات في المتصفح.'),
  ('attachments.cannotPreviewHint', 'UI_ATTACHMENTS', 'Download it to open it in its own application.', 'نزّله لفتحه في التطبيق الخاص به.'),
  ('attachments.evidenceHeading', 'UI_ATTACHMENTS', 'Evidence provided', 'الأدلة المقدَّمة'),
  ('attachments.evidenceRemoveFrom', 'UI_ATTACHMENTS', 'this requirement''s evidence', 'أدلة هذا المتطلب'),
  ('attachments.evidenceEmptyHint', 'UI_ATTACHMENTS', 'Add a document or a link to a page that shows this requirement is met.', 'أضف مستنداً أو رابطاً إلى صفحة تثبت استيفاء هذا المتطلب.'),
  ('attachments.filesAndLinks', 'UI_ATTACHMENTS', 'Files and links', 'الملفات والروابط'),
  ('attachments.docRemoveFrom', 'UI_ATTACHMENTS', 'this document', 'هذا المستند'),
  ('attachments.docEmptyHint', 'UI_ATTACHMENTS', 'Add the document itself, supporting files, or links to where it is published.', 'أضف المستند نفسه أو ملفات داعمة أو روابط إلى مكان نشره.'),
  ('attachments.filesLabel', 'UI_ATTACHMENTS', 'Files', 'الملفات'),
  ('attachments.newFilesHint', 'UI_ATTACHMENTS', 'Choose one or several, up to 25 MB each. PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), images and text files can be previewed in the page.', 'اختر ملفاً واحداً أو عدة ملفات، حتى 25 ميغابايت لكل ملف. يمكن معاينة ملفات PDF و Word (.docx) و PowerPoint (.pptx) و Excel (.xlsx) والصور والملفات النصية داخل الصفحة.'),
  ('attachments.newLinksHint', 'UI_ATTACHMENTS', 'One per line: a page in Bayanis, or any http(s) address. Titles and notes can be edited after saving.', 'رابط واحد في كل سطر: صفحة في بيانس أو أي عنوان http(s). يمكن تعديل العناوين والملاحظات بعد الحفظ.'),
  ('attachments.showFilesTooltip', 'UI_ATTACHMENTS', 'Show the files and links of this document', 'عرض ملفات وروابط هذا المستند'),
  ('attachments.attachingN', 'UI_ATTACHMENTS', 'Attaching {n} of {total}…', 'جارٍ إرفاق {n} من {total}…'),
  ('attachments.docSaveFailed', 'UI_ATTACHMENTS', 'The document could not be saved.', 'تعذّر حفظ المستند.'),
  ('attachments.notUploaded', 'UI_ATTACHMENTS', 'not uploaded', 'لم يُرفع'),
  ('attachments.notAdded', 'UI_ATTACHMENTS', 'not added', 'لم يُضَف'),
  ('attachments.attachFailed', 'UI_ATTACHMENTS', 'The document was saved, but {n} attachment(s) could not be added:

{list}

Open the document to add them again.', 'تم حفظ المستند، لكن تعذّرت إضافة {n} من المرفقات:

{list}

افتح المستند لإضافتها مرة أخرى.'),
  ('attachments.pdfFailed', 'UI_ATTACHMENTS', 'This PDF could not be shown here. Download it to open it in a PDF reader.', 'تعذّر عرض ملف PDF هنا. نزّله لفتحه في قارئ PDF.'),
  ('attachments.pdfPageOne', 'UI_ATTACHMENTS', '1 page', 'صفحة واحدة'),
  ('attachments.pdfPages', 'UI_ATTACHMENTS', '{n} pages', '{n} صفحات'),
  ('attachments.pdfFirstN', 'UI_ATTACHMENTS', ' · showing the first {n}; download to see the rest', ' · تُعرض أول {n} صفحة؛ نزّل الملف للاطلاع على الباقي'),
  ('attachments.zoomOut', 'UI_ATTACHMENTS', 'Zoom out', 'تصغير'),
  ('attachments.zoomIn', 'UI_ATTACHMENTS', 'Zoom in', 'تكبير'),
  ('attachments.pageN', 'UI_ATTACHMENTS', 'Page {n}', 'الصفحة {n}'),
  ('attachments.officeNote', 'UI_ATTACHMENTS', 'Preview — fonts and layout may differ from the original. Download the file for the exact copy.', 'معاينة — قد تختلف الخطوط والتنسيق عن الأصل. نزّل الملف للحصول على النسخة المطابقة.'),
  ('attachments.wordFailed', 'UI_ATTACHMENTS', 'This Word document could not be shown here. Download it to open it in its own application.', 'تعذّر عرض مستند Word هنا. نزّله لفتحه في التطبيق الخاص به.'),
  ('attachments.pptFailed', 'UI_ATTACHMENTS', 'This presentation could not be shown here. Download it to open it in its own application.', 'تعذّر عرض العرض التقديمي هنا. نزّله لفتحه في التطبيق الخاص به.'),
  ('attachments.excelFailed', 'UI_ATTACHMENTS', 'This workbook could not be shown here. Download it to open it in Excel.', 'تعذّر عرض المصنف هنا. نزّله لفتحه في Excel.'),
  ('attachments.excelNoSheets', 'UI_ATTACHMENTS', 'This workbook has no sheets.', 'لا يحتوي هذا المصنف على أي ورقة.'),
  ('attachments.excelEmptySheet', 'UI_ATTACHMENTS', 'This sheet is empty.', 'هذه الورقة فارغة.'),
  ('attachments.excelNote', 'UI_ATTACHMENTS', 'Values only — formulas show their last result; formatting, charts and merged cells are not drawn.', 'القيم فقط — تُعرض آخر نتيجة للمعادلات؛ ولا يُعرض التنسيق أو المخططات أو الخلايا المدمجة.'),
  ('attachments.excelCutRows', 'UI_ATTACHMENTS', ' Showing the first {shown} of {total} rows; download to see the rest.', ' يُعرض أول {shown} من {total} صف؛ نزّل الملف للاطلاع على الباقي.'),
  ('attachments.excelCutRowsCols', 'UI_ATTACHMENTS', ' Showing the first {shown} of {total} rows and {cols} of {totalCols} columns; download to see the rest.', ' يُعرض أول {shown} من {total} صف و{cols} من {totalCols} عمود؛ نزّل الملف للاطلاع على الباقي.');

UPDATE bayanat.translations t
SET status_code = 'STALE'
FROM bayanat.translation_keys tk
JOIN _tr174 n ON n.key_code = tk.key_code
WHERE t.key_id = tk.key_id AND tk.base_text <> n.base_text
  AND t.language_code <> 'ar' AND t.status_code <> 'MISSING';

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr174
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr174 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
