-- 212: Canada — PIPEDA and Québec Law 25.
--  * Breaches: a notice per law that applies, each with its own regulator and rule
--    (lib/privacy/breach-types.ts BREACH_LAWS). The single regulator notice on a breach
--    moves to bayanat.privacy_breach_notices, one row per law, with its own reminders.
--    The laws preselected on a new breach are a Configuration setting.
--  * Impact assessments: questionnaires for Québec Law 25 (ss. 3.3, 17, 21) and for
--    PIPEDA's fair information principles, with an Arabic draft for review
--    (AI_TRANSLATED, category Impact Assessment Templates). Both start in use; an admin
--    chooses which are used in Configuration › Privacy & Retention.
-- Safe to run more than once.

BEGIN;

-- ── Breach notices, one per law ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bayanat.privacy_breach_notices (
  breach_id            integer      NOT NULL REFERENCES bayanat.privacy_breaches(breach_id) ON DELETE CASCADE,
  regulation_code      varchar(20)  NOT NULL,
  authority_name_text  varchar(255),
  notified_at          timestamptz,
  reference_text       varchar(255),
  late_reason_text     text,
  due_reminded_at      timestamptz,
  overdue_reminded_at  timestamptz,
  PRIMARY KEY (breach_id, regulation_code)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'bayanat' AND table_name = 'privacy_breaches' AND column_name = 'authority_name_text') THEN
    EXECUTE $q$
      INSERT INTO bayanat.privacy_breach_notices (breach_id, regulation_code, authority_name_text, notified_at, reference_text, late_reason_text, due_reminded_at, overdue_reminded_at)
      SELECT b.breach_id, r.code,
             coalesce(b.authority_name_text, CASE r.code WHEN 'PDPL' THEN 'SDAIA (Saudi Data & AI Authority)' WHEN 'GDPR' THEN 'Lead supervisory authority' END),
             b.authority_notified_at, b.authority_reference_text, b.authority_late_reason_text, b.due_reminded_at, b.overdue_reminded_at
      FROM bayanat.privacy_breaches b CROSS JOIN LATERAL unnest(b.regulations) AS r(code)
      ON CONFLICT DO NOTHING
    $q$;
    ALTER TABLE bayanat.privacy_breaches
      DROP COLUMN authority_name_text, DROP COLUMN authority_notified_at, DROP COLUMN authority_reference_text,
      DROP COLUMN authority_late_reason_text, DROP COLUMN due_reminded_at, DROP COLUMN overdue_reminded_at;
  END IF;
END $$;

ALTER TABLE bayanat.privacy_breaches ALTER COLUMN regulations DROP DEFAULT;

INSERT INTO bayanat.system_config (key, value) VALUES ('breach_default_regulations', '["PDPL"]')
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bayanatix_kpi_readonly') THEN
    EXECUTE 'REVOKE ALL ON bayanat.privacy_breach_notices FROM bayanatix_kpi_readonly';
  END IF;
END $$;

-- ── Impact assessment questionnaires ────────────────────────────────────────
CREATE TEMP TABLE _tpl212 (code text, name text, name_ar text, regulation text, regulation_ar text, description text, description_ar text, threshold int, ord int) ON COMMIT DROP;
INSERT INTO _tpl212 VALUES
  ('LAW25', 'Québec Law 25', 'قانون 25 في كيبك', 'Act respecting the protection of personal information in the private sector (Québec), as amended by Law 25: privacy impact assessment (ss. 3.3, 17, 21)', 'قانون حماية المعلومات الشخصية في القطاع الخاص (كيبك) بتعديلاته بموجب القانون 25: تقييم الأثر على الخصوصية (المواد 3.3 و17 و21)', 'An assessment is required as soon as one screening case applies. It should be proportionate to the sensitivity, purpose, quantity, distribution and medium of the information.', 'يلزم التقييم متى انطبقت حالة واحدة من حالات الفحص، ويكون متناسباً مع حساسية المعلومات والغرض منها وكميتها وتوزيعها ووسيطها.', 1, 3),
  ('PIPEDA', 'Canada PIPEDA', 'قانون PIPEDA الكندي', 'Personal Information Protection and Electronic Documents Act, Schedule 1 fair information principles (privacy impact assessment, as recommended by the Office of the Privacy Commissioner of Canada)', 'قانون حماية المعلومات الشخصية والوثائق الإلكترونية، مبادئ المعالجة العادلة للمعلومات في الملحق 1 (تقييم الأثر على الخصوصية كما يوصي به مكتب مفوض الخصوصية في كندا)', 'PIPEDA does not itself require an assessment; the Privacy Commissioner recommends one for new or changed programs and systems. Here an assessment is recommended as soon as one screening question applies.', 'لا يشترط قانون PIPEDA التقييم بذاته، لكن مفوض الخصوصية يوصي به للبرامج والأنظمة الجديدة أو المعدلة. ويُوصى هنا بالتقييم متى انطبق سؤال واحد من أسئلة الفحص.', 1, 4);

INSERT INTO bayanat.dpia_templates (template_code, template_name_text, regulation_text, description_text, screening_threshold_int, is_active_indicator, is_default_indicator, sort_order_int)
SELECT code, name, regulation, description, threshold, true, false, ord FROM _tpl212
ON CONFLICT (template_code) DO NOTHING;

CREATE TEMP TABLE _q212 (template_code text, question_code text, stage_code text, section_code text, question_text text, question_ar text, help_text text, help_ar text, reference_text text, auto_code text, is_required boolean, ord int) ON COMMIT DROP;
INSERT INTO _q212 VALUES
  ('LAW25', 'S_SYSTEM', 'SCREENING', 'SCREENING', 'Does the project acquire, develop or overhaul an information system or electronic service delivery system that involves personal information?', 'هل يتضمن المشروع اقتناء نظام معلومات أو نظام لتقديم الخدمات إلكترونياً أو تطويره أو إعادة بنائه بما يشمل معلومات شخصية؟', 'Any system that collects, uses, communicates, keeps or destroys personal information.', 'أي نظام يجمع المعلومات الشخصية أو يستخدمها أو يفصح عنها أو يحفظها أو يتلفها.', 'Private Sector Act (Québec), s. 3.3', NULL, false, 1),
  ('LAW25', 'S_OUTSIDE_QC', 'SCREENING', 'SCREENING', 'Will personal information be communicated outside Québec, including to a service provider?', 'هل ستُفصح المعلومات الشخصية لجهة خارج كيبك، بما في ذلك مزود خدمة؟', NULL, NULL, 'Private Sector Act (Québec), s. 17', 'CROSS_BORDER', false, 2),
  ('LAW25', 'S_RESEARCH', 'SCREENING', 'SCREENING', 'Will personal information be communicated without consent for study, research or the production of statistics?', 'هل ستُفصح المعلومات الشخصية دون موافقة لأغراض الدراسة أو البحث أو إعداد الإحصاءات؟', NULL, NULL, 'Private Sector Act (Québec), s. 21', NULL, false, 3),
  ('LAW25', 'A_PURPOSE', 'ASSESSMENT', 'DESCRIPTION', 'What is the project, and for what purposes is personal information used?', 'ما المشروع، ولأي أغراض تُستخدم المعلومات الشخصية؟', 'Purposes must be determined before the information is collected.', 'يجب تحديد الأغراض قبل جمع المعلومات.', 'Private Sector Act (Québec), s. 4', 'SUBJECT', true, 100),
  ('LAW25', 'A_CONSENT', 'ASSESSMENT', 'DESCRIPTION', 'Is consent obtained, or does the law allow the use without it?', 'هل تُؤخذ الموافقة، أم يجيز القانون الاستخدام دونها؟', 'Consent must be manifest, free, enlightened and given for specific purposes; sensitive information needs express consent.', 'يجب أن تكون الموافقة صريحة وحرة ومستنيرة ولأغراض محددة، وتحتاج المعلومات الحساسة إلى موافقة صريحة.', 'Private Sector Act (Québec), ss. 12, 14', 'LEGAL_BASIS', true, 101),
  ('LAW25', 'A_DATA', 'ASSESSMENT', 'DESCRIPTION', 'What personal information is involved, about whom, and is any of it sensitive?', 'ما المعلومات الشخصية المعنية، وعن مَن، وهل فيها معلومات حساسة؟', 'Information is sensitive when, because of its medical, biometric or otherwise intimate nature or its context, it raises a high reasonable expectation of privacy.', 'تكون المعلومات حساسة إذا كانت، بسبب طبيعتها الطبية أو الحيوية أو الحميمة أو سياقها، تثير توقعاً معقولاً عالياً بالخصوصية.', 'Private Sector Act (Québec), s. 12', 'PERSONAL_DATA', true, 102),
  ('LAW25', 'A_NATURE', 'ASSESSMENT', 'DESCRIPTION', 'How is the information collected, used and kept, and who can access it?', 'كيف تُجمع المعلومات وتُستخدم وتُحفظ، ومن يستطيع الوصول إليها؟', NULL, NULL, NULL, 'ACCESS', false, 103),
  ('LAW25', 'A_SCALE', 'ASSESSMENT', 'DESCRIPTION', 'How much information, about how many people, and how widely is it distributed?', 'ما كمية المعلومات، وعن كم شخص، وما مدى انتشارها؟', NULL, NULL, 'Private Sector Act (Québec), s. 3.3', 'SCALE', false, 104),
  ('LAW25', 'A_FLOWS', 'ASSESSMENT', 'DESCRIPTION', 'Which systems hold or receive copies of the information?', 'ما الأنظمة التي تحفظ المعلومات أو تتلقى نسخاً منها؟', NULL, NULL, NULL, 'FLOWS', false, 105),
  ('LAW25', 'A_RECIPIENTS', 'ASSESSMENT', 'DESCRIPTION', 'Who receives the information, including service providers?', 'من يتلقى المعلومات، بمن فيهم مزودو الخدمات؟', 'A service provider must be bound by a written contract with the protection measures.', 'يجب إلزام مزود الخدمة بعقد مكتوب يتضمن تدابير الحماية.', 'Private Sector Act (Québec), s. 18.3', 'RECIPIENTS', false, 106),
  ('LAW25', 'A_RETENTION', 'ASSESSMENT', 'DESCRIPTION', 'How long is the information kept, and how is it destroyed or anonymized?', 'كم مدة حفظ المعلومات، وكيف تُتلف أو تُجهَّل هويتها؟', NULL, NULL, 'Private Sector Act (Québec), s. 23', 'RETENTION', false, 107),
  ('LAW25', 'A_NECESSITY', 'ASSESSMENT', 'NECESSITY', 'Is each item of information necessary for the purposes?', 'هل كل عنصر من المعلومات ضروري للأغراض؟', NULL, NULL, 'Private Sector Act (Québec), s. 5', NULL, true, 108),
  ('LAW25', 'A_DEFAULT', 'ASSESSMENT', 'NECESSITY', 'For a product or service offered to the public, are the highest confidentiality settings on by default?', 'في المنتج أو الخدمة المقدمة للجمهور، هل تكون أعلى إعدادات السرية مفعّلة افتراضياً؟', NULL, NULL, 'Private Sector Act (Québec), s. 9.1', NULL, false, 109),
  ('LAW25', 'A_TECH', 'ASSESSMENT', 'NECESSITY', 'Does it use technology that can identify, locate or profile people, and are they told and able to turn it off?', 'هل يستخدم تقنية يمكنها تحديد هوية الأشخاص أو مواقعهم أو تنميطهم، وهل يُبلَّغون ويستطيعون تعطيلها؟', NULL, NULL, 'Private Sector Act (Québec), s. 8.1', NULL, false, 110),
  ('LAW25', 'A_TRANSFER', 'ASSESSMENT', 'NECESSITY', 'If communicated outside Québec: how sensitive is the information, for what purposes, with what protection (including contractual), under what legal framework in the destination, and will it be adequately protected?', 'إن أُفصح عنها خارج كيبك: ما حساسية المعلومات، ولأي أغراض، وبأي حماية (بما فيها التعاقدية)، وفي ظل أي إطار قانوني في بلد الوجهة، وهل ستحظى بحماية كافية؟', 'Communication is allowed only if the assessment shows adequate protection, and must be covered by a written agreement.', 'لا يجوز الإفصاح إلا إذا أظهر التقييم حماية كافية، ويجب أن يغطيه اتفاق مكتوب.', 'Private Sector Act (Québec), s. 17', 'RECIPIENTS', false, 111),
  ('LAW25', 'A_RIGHTS', 'ASSESSMENT', 'NECESSITY', 'How are people informed, and how can they access, correct or withdraw consent, or ask for de-indexing?', 'كيف يُبلَّغ الأشخاص، وكيف يطلبون الوصول أو التصحيح أو سحب الموافقة أو إلغاء الفهرسة؟', NULL, NULL, 'Private Sector Act (Québec), ss. 8, 27, 28.1', NULL, false, 112),
  ('LAW25', 'A_CONSULTATION', 'ASSESSMENT', 'CONSULTATION', 'Was the person in charge of the protection of personal information consulted from the start, and whose other views were sought?', 'هل استُشير المسؤول عن حماية المعلومات الشخصية منذ البداية، ومن الذين أُخذت آراؤهم أيضاً؟', 'The law requires consulting the person in charge from the outset of the project.', 'يشترط القانون استشارة المسؤول منذ بداية المشروع.', 'Private Sector Act (Québec), s. 3.3', NULL, true, 113),
  ('PIPEDA', 'S_NEW_PROGRAM', 'SCREENING', 'SCREENING', 'Is this a new or substantially changed program, system or technology that handles personal information?', 'هل هذا برنامج أو نظام أو تقنية جديدة أو معدّلة جوهرياً تتعامل مع معلومات شخصية؟', NULL, NULL, 'OPC guidance on privacy impact assessments', NULL, false, 1),
  ('PIPEDA', 'S_SENSITIVE', 'SCREENING', 'SCREENING', 'Does it involve sensitive personal information?', 'هل يتضمن معلومات شخصية حساسة؟', 'For example health, financial or biometric information, or information about children.', 'مثل المعلومات الصحية أو المالية أو الحيوية، أو المعلومات عن الأطفال.', 'PIPEDA, Schedule 1, Principle 4.3.4', 'SENSITIVE_PI', false, 2),
  ('PIPEDA', 'S_LARGE_SCALE', 'SCREENING', 'SCREENING', 'Does it involve the personal information of a large number of people?', 'هل يتضمن المعلومات الشخصية لعدد كبير من الأشخاص؟', NULL, NULL, 'OPC guidance on privacy impact assessments', 'LARGE_SCALE', false, 3),
  ('PIPEDA', 'S_NEW_PURPOSE', 'SCREENING', 'SCREENING', 'Will personal information be used or disclosed for a purpose other than the one it was collected for?', 'هل ستُستخدم المعلومات الشخصية أو يُفصح عنها لغرض غير الذي جُمعت من أجله؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.5', NULL, false, 4),
  ('PIPEDA', 'S_TRANSFER', 'SCREENING', 'SCREENING', 'Will personal information be transferred to a third party for processing, including outside Canada?', 'هل ستُنقل المعلومات الشخصية إلى طرف ثالث لمعالجتها، بما في ذلك خارج كندا؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.1.3', 'CROSS_BORDER', false, 5),
  ('PIPEDA', 'S_MONITORING', 'SCREENING', 'SCREENING', 'Does it monitor, track or profile people, or make automated decisions about them?', 'هل يراقب الأشخاص أو يتتبعهم أو ينمّطهم، أو يتخذ قرارات آلية بشأنهم؟', NULL, NULL, 'OPC guidance on privacy impact assessments', NULL, false, 6),
  ('PIPEDA', 'A_PURPOSE', 'ASSESSMENT', 'DESCRIPTION', 'What are the purposes, and are they identified to people at or before collection?', 'ما الأغراض، وهل تُحدَّد للأشخاص عند الجمع أو قبله؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.2', 'SUBJECT', true, 100),
  ('PIPEDA', 'A_CONSENT', 'ASSESSMENT', 'DESCRIPTION', 'How is meaningful consent obtained, express or implied?', 'كيف تُؤخذ موافقة ذات معنى، صريحة أو ضمنية؟', 'The form of consent depends on the sensitivity of the information and people''s reasonable expectations.', 'يعتمد شكل الموافقة على حساسية المعلومات والتوقعات المعقولة للأشخاص.', 'PIPEDA, Schedule 1, Principle 4.3', 'LEGAL_BASIS', true, 101),
  ('PIPEDA', 'A_DATA', 'ASSESSMENT', 'DESCRIPTION', 'What personal information is collected, and about whom?', 'ما المعلومات الشخصية التي تُجمع، وعن مَن؟', NULL, NULL, NULL, 'PERSONAL_DATA', true, 102),
  ('PIPEDA', 'A_NATURE', 'ASSESSMENT', 'DESCRIPTION', 'How is it collected, used and stored, and who can access it?', 'كيف تُجمع وتُستخدم وتُخزَّن، ومن يستطيع الوصول إليها؟', NULL, NULL, NULL, 'ACCESS', false, 103),
  ('PIPEDA', 'A_SCALE', 'ASSESSMENT', 'DESCRIPTION', 'What is the scale of the processing?', 'ما حجم المعالجة ونطاقها؟', NULL, NULL, NULL, 'SCALE', false, 104),
  ('PIPEDA', 'A_FLOWS', 'ASSESSMENT', 'DESCRIPTION', 'Which systems hold or receive copies of the information?', 'ما الأنظمة التي تحفظ المعلومات أو تتلقى نسخاً منها؟', NULL, NULL, NULL, 'FLOWS', false, 105),
  ('PIPEDA', 'A_RECIPIENTS', 'ASSESSMENT', 'DESCRIPTION', 'Who receives it, including service providers and any transfer outside Canada, and how is comparable protection ensured?', 'من يتلقاها، بمن فيهم مزودو الخدمات وأي نقل خارج كندا، وكيف تُضمن حماية مماثلة؟', 'The organisation remains responsible for information transferred for processing, and should ensure a comparable level of protection by contract.', 'تبقى الجهة مسؤولة عن المعلومات المنقولة للمعالجة، وعليها ضمان مستوى حماية مماثل بموجب عقد.', 'PIPEDA, Schedule 1, Principle 4.1.3', 'RECIPIENTS', false, 106),
  ('PIPEDA', 'A_RETENTION', 'ASSESSMENT', 'DESCRIPTION', 'How long is it kept, and how is it destroyed or made anonymous?', 'كم مدة الاحتفاظ بها، وكيف تُتلف أو تُجهَّل هويتها؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.5', 'RETENTION', false, 107),
  ('PIPEDA', 'A_LIMITING', 'ASSESSMENT', 'NECESSITY', 'Is collection limited to what the identified purposes need?', 'هل يقتصر الجمع على ما تحتاجه الأغراض المحددة؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.4', NULL, true, 108),
  ('PIPEDA', 'A_ACCURACY', 'ASSESSMENT', 'NECESSITY', 'How is the information kept accurate, complete and up to date?', 'كيف تُحفظ المعلومات دقيقة وكاملة ومحدّثة؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.6', NULL, false, 109),
  ('PIPEDA', 'A_SAFEGUARDS', 'ASSESSMENT', 'NECESSITY', 'What safeguards protect it, appropriate to its sensitivity?', 'ما الضمانات التي تحميها بما يتناسب مع حساسيتها؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.7', NULL, false, 110),
  ('PIPEDA', 'A_OPENNESS', 'ASSESSMENT', 'NECESSITY', 'How are people informed, and how can they access and correct their information and challenge compliance?', 'كيف يُبلَّغ الأشخاص، وكيف يصلون إلى معلوماتهم ويصححونها ويعترضون على الامتثال؟', NULL, NULL, 'PIPEDA, Schedule 1, Principles 4.8–4.10', NULL, false, 111),
  ('PIPEDA', 'A_ACCOUNTABILITY', 'ASSESSMENT', 'NECESSITY', 'Who is accountable for compliance with the principles?', 'من المسؤول عن الامتثال للمبادئ؟', NULL, NULL, 'PIPEDA, Schedule 1, Principle 4.1', NULL, false, 112),
  ('PIPEDA', 'A_CONSULTATION', 'ASSESSMENT', 'CONSULTATION', 'Whose views were sought, and what did they say?', 'من الذين أُخذ رأيهم، وماذا كان رأيهم؟', 'The privacy officer, information security, legal and, where possible, the people affected.', 'مسؤول الخصوصية، وأمن المعلومات، والشؤون القانونية، والأشخاص المتأثرون حيثما أمكن.', NULL, NULL, false, 113);

INSERT INTO bayanat.dpia_template_questions (template_id, question_code, stage_code, section_code, question_text, help_text, reference_text, auto_code, is_required_indicator, sort_order_int)
SELECT t.template_id, n.question_code, n.stage_code, n.section_code, n.question_text, n.help_text, n.reference_text, n.auto_code, n.is_required, n.ord
FROM _q212 n JOIN bayanat.dpia_templates t ON t.template_code = n.template_code
ON CONFLICT (template_id, question_code) DO NOTHING;

CREATE TEMP TABLE _tr212 (key_code text, base_text text, ar_text text) ON COMMIT DROP;
INSERT INTO _tr212
SELECT 'dpia_templates.' || t.template_id || '.' || f.suffix, f.base_text, f.ar_text
FROM _tpl212 n JOIN bayanat.dpia_templates t ON t.template_code = n.code
CROSS JOIN LATERAL (VALUES ('name', n.name, n.name_ar), ('regulation', n.regulation, n.regulation_ar), ('description', n.description, n.description_ar)) AS f(suffix, base_text, ar_text);
INSERT INTO _tr212
SELECT 'dpia_template_questions.' || qq.question_id || '.' || f.suffix, f.base_text, f.ar_text
FROM _q212 n
JOIN bayanat.dpia_templates t ON t.template_code = n.template_code
JOIN bayanat.dpia_template_questions qq ON qq.template_id = t.template_id AND qq.question_code = n.question_code
CROSS JOIN LATERAL (VALUES ('text', n.question_text, n.question_ar), ('help', n.help_text, n.help_ar)) AS f(suffix, base_text, ar_text)
WHERE f.base_text IS NOT NULL;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT 'DPIA_TEMPLATES', key_code, base_text FROM _tr212
ON CONFLICT (key_code) DO NOTHING;

-- Drafts only where the English is still the one translated, never over a person's work.
INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, model_ref_text, translated_at)
SELECT tk.key_id, 'ar', n.ar_text, 'AI_TRANSLATED', 'Anthropic Claude:claude-opus-5-5', now()
FROM _tr212 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code AND tk.base_text = n.base_text
WHERE n.ar_text IS NOT NULL
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'AI_TRANSLATED', model_ref_text = EXCLUDED.model_ref_text, translated_at = now()
  WHERE bayanat.translations.status_code IN ('MISSING', 'STALE', 'AI_TRANSLATED') OR bayanat.translations.translated_text IS NULL;

COMMIT;
