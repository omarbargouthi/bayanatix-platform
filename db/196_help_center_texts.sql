-- 196: Help Center screens and the "How is this calculated?" notes on the Data Catalog
-- indicators. The help documents' own texts are registered by the app itself (category
-- HELP_DOCS, lib/help/content.ts). Safe to run more than once.

BEGIN;

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('UI_HELP', 'Help Center', 'UI'),
  ('HELP_DOCS', 'Help Center', 'LIST')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr196 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr196 (key_code, category_code, base_text, ar_text) VALUES
  ('nav.helpCenter', 'UI_NAV', E'Help Center', E'مركز المساعدة'),
  ('catalog.cdeCoverageHow', 'UI_CATALOG', E'The share of business columns that are critical data elements (CDEs).\n\nCDE columns ÷ business columns × 100.\n\nA CDE is an active business column whose classification term is Confidential, Secret or Top Secret. Technical columns are not counted. Follows the source filter.', E'نسبة الأعمدة التجارية التي تُعد عناصر بيانات حرجة.\n\nالأعمدة الحرجة ÷ الأعمدة التجارية × 100.\n\nالعنصر الحرج عمود تجاري نشط مصطلح تصنيفه «سري» أو «سري للغاية» أو «سري جداً». لا تُحتسب الأعمدة التقنية. يتبع تصفية المصادر.'),
  ('catalog.classificationHow', 'UI_CATALOG', E'The share of active business columns that have a classification term.\n\nClassified business columns ÷ all business columns × 100.\n\nThe bar splits the classified columns by classification level, from the lowest to the highest. Follows the source filter.', E'نسبة الأعمدة التجارية النشطة التي لها مصطلح تصنيف.\n\nالأعمدة التجارية المصنفة ÷ جميع الأعمدة التجارية × 100.\n\nيقسم الشريط الأعمدة المصنفة حسب مستوى التصنيف من الأدنى إلى الأعلى. يتبع تصفية المصادر.'),
  ('catalog.metadataQualityHow', 'UI_CATALOG', E'For critical data elements (CDEs) only. Each measure is a share of all CDEs:\n• Completeness: CDEs with a description.\n• Accuracy: CDEs certified for their data.\n• Consistency: CDEs linked to a glossary term for enrichment.\n\nThe score is the average of the three.', E'لعناصر البيانات الحرجة فقط. كل مقياس نسبة من جميع العناصر الحرجة:\n• الاكتمال: العناصر التي لها وصف.\n• الدقة: العناصر المعتمدة من حيث بياناتها.\n• الاتساق: العناصر المرتبطة بمصطلح في المسرد للإثراء.\n\nالنتيجة متوسط المقاييس الثلاثة.'),
  ('catalog.dataQualityHow', 'UI_CATALOG', E'For critical data elements (CDEs) only. Each dimension scores the average latest result of the active quality rules on CDE columns in that dimension.\n\nThe score is the weighted average of the enabled dimensions that have scored rules, using the weights set under Configure. A dimension without rules is left out, not counted as 0.', E'لعناصر البيانات الحرجة فقط. درجة كل بُعد هي متوسط آخر نتيجة لقواعد الجودة النشطة على أعمدة العناصر الحرجة في ذلك البُعد.\n\nالنتيجة هي المتوسط المرجّح للأبعاد المفعّلة التي لها قواعد ذات نتائج، بالأوزان المحددة في «تهيئة». يُستبعد البُعد الذي لا قواعد له ولا يُحتسب صفراً.'),
  ('help.title', 'UI_HELP', E'Help Center', E'مركز المساعدة'),
  ('help.subtitle', 'UI_HELP', E'How to use each feature of Bayanis, the value it brings, how its indicators are calculated, and what each connector covers.', E'كيفية استخدام كل ميزة في بيانيس، والقيمة التي تقدمها، وطريقة حساب مؤشراتها، وما يغطيه كل موصل.'),
  ('help.searchPh', 'UI_HELP', E'Search the help…', E'ابحث في المساعدة…'),
  ('help.noResults', 'UI_HELP', E'No topic matches your search.', E'لا يوجد موضوع يطابق بحثك.'),
  ('help.allTopics', 'UI_HELP', E'All topics', E'كل المواضيع'),
  ('help.onThisPage', 'UI_HELP', E'On this page', E'في هذه الصفحة'),
  ('help.related', 'UI_HELP', E'Related topics', E'مواضيع ذات صلة'),
  ('help.openPage', 'UI_HELP', E'Open this page', E'فتح هذه الصفحة'),
  ('help.notFound', 'UI_HELP', E'This help topic doesn''t exist.', E'موضوع المساعدة هذا غير موجود.'),
  ('help.untranslatedNote', 'UI_HELP', E'Parts of the Help Center that are not translated yet are shown in English.', E'تظهر أجزاء مركز المساعدة غير المترجمة بعد باللغة الإنجليزية.'),
  ('help.translateLink', 'UI_HELP', E'Translate the Help Center', E'ترجمة مركز المساعدة'),
  ('help.about', 'UI_HELP', E'About Bayanis and your license', E'عن بيانيس والترخيص'),
  ('help.howCalculated', 'UI_HELP', E'How is this calculated?', E'كيف يُحسب هذا؟'),
  ('help.readMore', 'UI_HELP', E'Read more in the Help Center', E'اقرأ المزيد في مركز المساعدة'),
  ('help.groupStart', 'UI_HELP', E'Getting started', E'البدء'),
  ('help.groupWorkspace', 'UI_HELP', E'Your workspace', E'مساحة عملك'),
  ('help.groupCatalog', 'UI_HELP', E'Data Catalog', E'كتالوج البيانات'),
  ('help.groupDomains', 'UI_HELP', E'Data management domains', E'مجالات إدارة البيانات'),
  ('help.groupPrivacy', 'UI_HELP', E'Data Privacy', E'خصوصية البيانات'),
  ('help.groupReports', 'UI_HELP', E'Reports', E'التقارير'),
  ('help.groupAdmin', 'UI_HELP', E'Administration', E'الإدارة');

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr196
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr196 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
