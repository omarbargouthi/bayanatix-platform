-- 179: Arabic for the Source Systems statistics (Reports › Source Systems and the
-- Dashboard) and for the Dashboard's Data Governance announcements. New texts in
-- lib/i18n/en.ts need their key and Arabic in the translations table as well (see db/174).
-- Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_SOURCESTATS', 'Source Systems', 'UI'),
  ('UI_ANNOUNCEMENTS', 'Announcements', 'UI')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr179 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr179 (key_code, category_code, base_text, ar_text) VALUES
  ('sourceStats.reportTitle', 'UI_SOURCESTATS', 'Source Systems', 'الأنظمة المصدرية'),
  ('sourceStats.reportSubtitle', 'UI_SOURCESTATS', 'Counts, types, classification, certification, ratings and the most used assets of the source systems, by source and steward.', 'أعداد الأنظمة المصدرية وأنواعها وتصنيفها واعتمادها وتقييماتها وأكثر أصولها استخداماً، حسب المصدر والمشرف.'),
  ('sourceStats.reportSubtitleMine', 'UI_SOURCESTATS', 'The source systems you hold a governance role on.', 'الأنظمة المصدرية التي لديك دور حوكمة عليها.'),
  ('sourceStats.dashboardTitleAll', 'UI_SOURCESTATS', 'Source Systems', 'الأنظمة المصدرية'),
  ('sourceStats.dashboardTitleMine', 'UI_SOURCESTATS', 'My Source Systems', 'أنظمتي المصدرية'),
  ('sourceStats.dashboardSubtitleAll', 'UI_SOURCESTATS', 'All source systems. Narrow by source or steward.', 'جميع الأنظمة المصدرية. يمكنك التصفية حسب المصدر أو المشرف.'),
  ('sourceStats.dashboardSubtitleMine', 'UI_SOURCESTATS', 'The source systems you hold a governance role on.', 'الأنظمة المصدرية التي لديك دور حوكمة عليها.'),
  ('sourceStats.openReport', 'UI_SOURCESTATS', 'Open the full report →', 'فتح التقرير الكامل ←'),
  ('sourceStats.filterSource', 'UI_SOURCESTATS', 'Source system', 'النظام المصدري'),
  ('sourceStats.filterSteward', 'UI_SOURCESTATS', 'Steward', 'المشرف'),
  ('sourceStats.allSources', 'UI_SOURCESTATS', 'All source systems', 'جميع الأنظمة المصدرية'),
  ('sourceStats.allMySources', 'UI_SOURCESTATS', 'All my source systems', 'جميع أنظمتي المصدرية'),
  ('sourceStats.allStewards', 'UI_SOURCESTATS', 'All stewards', 'جميع المشرفين'),
  ('sourceStats.noSources', 'UI_SOURCESTATS', 'No source systems to show. You see the sources you hold a governance role on (owner or steward of the source, or of a schema or table in it).', 'لا توجد أنظمة مصدرية لعرضها. تظهر لك المصادر التي لديك دور حوكمة عليها (مالك أو مشرف على المصدر أو على مخطط أو جدول ضمنه).'),
  ('sourceStats.countSources', 'UI_SOURCESTATS', 'Source systems', 'الأنظمة المصدرية'),
  ('sourceStats.countSchemas', 'UI_SOURCESTATS', 'Schemas', 'المخططات'),
  ('sourceStats.countObjects', 'UI_SOURCESTATS', 'Tables and other objects', 'الجداول والكائنات الأخرى'),
  ('sourceStats.countColumns', 'UI_SOURCESTATS', 'Columns', 'الأعمدة'),
  ('sourceStats.sourceTypes', 'UI_SOURCESTATS', 'Source types', 'أنواع المصادر'),
  ('sourceStats.objectTypes', 'UI_SOURCESTATS', 'Object types', 'أنواع الكائنات'),
  ('sourceStats.tableTypes', 'UI_SOURCESTATS', 'Table types', 'أنواع الجداول'),
  ('sourceStats.columnTypes', 'UI_SOURCESTATS', 'Column types', 'أنواع الأعمدة'),
  ('sourceStats.classification', 'UI_SOURCESTATS', 'Data classification (columns)', 'تصنيف البيانات (الأعمدة)'),
  ('sourceStats.classifiedPct', 'UI_SOURCESTATS', '{pct}% classified', '{pct}% مصنَّفة'),
  ('sourceStats.certification', 'UI_SOURCESTATS', 'Certification (tables)', 'الاعتماد (الجداول)'),
  ('sourceStats.certifiedPct', 'UI_SOURCESTATS', '{pct}% certified', '{pct}% معتمدة'),
  ('sourceStats.certMetadata', 'UI_SOURCESTATS', 'Metadata', 'البيانات الوصفية'),
  ('sourceStats.certData', 'UI_SOURCESTATS', 'Data', 'البيانات'),
  ('sourceStats.certNote', 'UI_SOURCESTATS', '{certified} of {total} tables and objects hold a certification.', '{certified} من {total} جدول وكائن لديها اعتماد.'),
  ('sourceStats.ratings', 'UI_SOURCESTATS', 'Ratings', 'التقييمات'),
  ('sourceStats.ratedObjects', 'UI_SOURCESTATS', '{n} rated', '{n} مقيَّمة'),
  ('sourceStats.ratingsCount', 'UI_SOURCESTATS', '{n} ratings', '{n} تقييم'),
  ('sourceStats.noRatings', 'UI_SOURCESTATS', 'No ratings yet.', 'لا توجد تقييمات بعد.'),
  ('sourceStats.notSet', 'UI_SOURCESTATS', 'Not set', 'غير محدد'),
  ('sourceStats.notClassified', 'UI_SOURCESTATS', 'Not classified', 'غير مصنَّف'),
  ('sourceStats.nothingYet', 'UI_SOURCESTATS', 'Nothing to show yet.', 'لا يوجد ما يُعرض بعد.'),
  ('sourceStats.mostUsed', 'UI_SOURCESTATS', 'Most used assets', 'الأصول الأكثر استخداماً'),
  ('sourceStats.mostUsedNote', 'UI_SOURCESTATS', 'Opened in Bayanis, last 90 days', 'فُتحت في بيانس خلال آخر 90 يوماً'),
  ('sourceStats.mostSearched', 'UI_SOURCESTATS', 'Most searched assets', 'الأصول الأكثر بحثاً'),
  ('sourceStats.mostSearchedNote', 'UI_SOURCESTATS', 'Searches matching the name, last 90 days', 'عمليات بحث تطابق الاسم خلال آخر 90 يوماً'),
  ('sourceStats.highestRated', 'UI_SOURCESTATS', 'Highest rated assets', 'الأصول الأعلى تقييماً'),
  ('sourceStats.lowestRated', 'UI_SOURCESTATS', 'Lowest rated assets', 'الأصول الأدنى تقييماً'),
  ('sourceStats.noActivity', 'UI_SOURCESTATS', 'No activity in this period.', 'لا يوجد نشاط في هذه الفترة.'),
  ('sourceStats.views', 'UI_SOURCESTATS', '{n} views', '{n} مشاهدة'),
  ('sourceStats.searches', 'UI_SOURCESTATS', '{n} searches', '{n} عملية بحث'),
  ('sourceStats.users', 'UI_SOURCESTATS', '{n} users', '{n} مستخدم'),
  ('sourceStats.tiers.GOLD', 'UI_SOURCESTATS', 'Gold', 'ذهبي'),
  ('sourceStats.tiers.SILVER', 'UI_SOURCESTATS', 'Silver', 'فضي'),
  ('sourceStats.tiers.BRONZE', 'UI_SOURCESTATS', 'Bronze', 'برونزي'),
  ('announcements.title', 'UI_ANNOUNCEMENTS', 'Data Governance Announcements', 'إعلانات حوكمة البيانات'),
  ('announcements.subtitle', 'UI_ANNOUNCEMENTS', 'Milestones, upcoming events, training material and newly published policies and procedures.', 'المراحل الرئيسية والفعاليات القادمة والمواد التدريبية والسياسات والإجراءات المنشورة حديثاً.'),
  ('announcements.viewAll', 'UI_ANNOUNCEMENTS', 'Governance Framework →', 'إطار الحوكمة ←'),
  ('announcements.upcoming', 'UI_ANNOUNCEMENTS', 'Upcoming', 'قادم'),
  ('announcements.effectiveOn', 'UI_ANNOUNCEMENTS', 'On {date}', 'بتاريخ {date}'),
  ('announcements.effectiveSince', 'UI_ANNOUNCEMENTS', 'Since {date}', 'منذ {date}'),
  ('announcements.attachments', 'UI_ANNOUNCEMENTS', '{n} files and links', '{n} ملفات وروابط'),
  ('announcements.emptyManage', 'UI_ANNOUNCEMENTS', 'Nothing is being announced. A document appears here when it comes into effect within 90 days, was approved in the last 30 days, or has “Show on the dashboard” ticked in the Governance Framework.', 'لا توجد إعلانات حالياً. تظهر الوثيقة هنا عندما يبدأ سريانها خلال 90 يوماً، أو إذا اعتُمدت خلال آخر 30 يوماً، أو عند تفعيل خيار «العرض في لوحة التحكم» لها في إطار الحوكمة.'),
  ('announcements.pinLabel', 'UI_ANNOUNCEMENTS', 'Show on the dashboard', 'العرض في لوحة التحكم'),
  ('announcements.pinHint', 'UI_ANNOUNCEMENTS', 'Advertises this document to everyone in the Dashboard''s announcements. Documents coming into effect within 90 days, or approved in the last 30, are announced without it.', 'يعلن عن هذه الوثيقة للجميع ضمن إعلانات لوحة التحكم. الوثائق التي يبدأ سريانها خلال 90 يوماً أو التي اعتُمدت خلال آخر 30 يوماً تُعلَن دون الحاجة إلى هذا الخيار.'),
  ('announcements.kinds.ROADMAP', 'UI_ANNOUNCEMENTS', 'Milestone', 'مرحلة رئيسية'),
  ('announcements.kinds.TRAINING', 'UI_ANNOUNCEMENTS', 'Training', 'تدريب'),
  ('announcements.kinds.POLICY', 'UI_ANNOUNCEMENTS', 'Policy', 'سياسة'),
  ('announcements.kinds.PROCESS', 'UI_ANNOUNCEMENTS', 'Procedure', 'إجراء'),
  ('announcements.kinds.STANDARD', 'UI_ANNOUNCEMENTS', 'Standard', 'معيار'),
  ('announcements.kinds.STRATEGY', 'UI_ANNOUNCEMENTS', 'Strategy', 'استراتيجية'),
  ('announcements.kinds.REGULATORY', 'UI_ANNOUNCEMENTS', 'Regulation', 'لائحة'),
  ('announcements.statuses.DRAFT', 'UI_ANNOUNCEMENTS', 'Draft', 'مسودة'),
  ('announcements.statuses.REVIEW', 'UI_ANNOUNCEMENTS', 'Under review', 'قيد المراجعة'),
  ('announcements.statuses.APPROVED', 'UI_ANNOUNCEMENTS', 'Approved', 'معتمد');

UPDATE bayanat.translations t
SET status_code = 'STALE'
FROM bayanat.translation_keys tk
JOIN _tr179 n ON n.key_code = tk.key_code
WHERE t.key_id = tk.key_id AND tk.base_text <> n.base_text
  AND t.language_code <> 'ar' AND t.status_code <> 'MISSING';

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr179
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr179 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
