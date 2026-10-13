-- 186: Data protection impact assessments (DPIA): the register, screening and assessment
-- answers, risks scored before and after mitigation, measures tracked to closure, the
-- frozen version kept at every decision, and two seeded questionnaire templates (Saudi
-- PDPL, GDPR Art. 35) with their Arabic. Also adds the fields a DPIA reads to the
-- Activity custom asset type where the RoPA-lite template is installed.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.dpia_templates (
  template_id            serial PRIMARY KEY,
  template_code          varchar(30)  NOT NULL UNIQUE,
  template_name_text     varchar(150) NOT NULL,
  regulation_text        varchar(300),
  description_text       text,
  -- Number of screening questions answered Yes that makes an assessment required.
  screening_threshold_int integer NOT NULL DEFAULT 1 CHECK (screening_threshold_int >= 1),
  is_active_indicator    boolean NOT NULL DEFAULT true,
  is_default_indicator   boolean NOT NULL DEFAULT false,
  sort_order_int         integer NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bayanat.dpia_template_questions (
  question_id           serial PRIMARY KEY,
  template_id           integer NOT NULL REFERENCES bayanat.dpia_templates(template_id) ON DELETE CASCADE,
  question_code         varchar(40) NOT NULL,
  stage_code            varchar(20) NOT NULL CHECK (stage_code IN ('SCREENING', 'ASSESSMENT')),
  section_code          varchar(30) NOT NULL,          -- SCREENING / DESCRIPTION / NECESSITY / CONSULTATION
  question_text         text NOT NULL,
  help_text             text,
  reference_text        varchar(300),
  -- Screening: the catalog finding that suggests Yes. Assessment: the block of catalog
  -- facts shown under the question.
  auto_code             varchar(40),
  is_required_indicator boolean NOT NULL DEFAULT false,
  sort_order_int        integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, question_code)
);

CREATE TABLE IF NOT EXISTS bayanat.dpias (
  dpia_id                  serial PRIMARY KEY,
  reference_code           varchar(30) NOT NULL UNIQUE,            -- DPIA-2026-0001
  title_text               varchar(255) NOT NULL,
  description_text         text,
  template_id              integer NOT NULL REFERENCES bayanat.dpia_templates(template_id),
  status_code              varchar(30) NOT NULL DEFAULT 'SCREENING' CHECK (status_code IN
                             ('SCREENING', 'NOT_REQUIRED', 'ASSESSMENT', 'IN_REVIEW', 'APPROVED', 'APPROVED_WITH_CONDITIONS', 'REJECTED')),
  screening_outcome_code   varchar(20) CHECK (screening_outcome_code IN ('REQUIRED', 'NOT_REQUIRED')),
  screening_note_text      text,
  screening_by_user_id     varchar(100) REFERENCES bayanat.users(user_id),
  screening_at             timestamptz,
  owner_user_id            varchar(100) REFERENCES bayanat.users(user_id),
  submitted_by_user_id     varchar(100) REFERENCES bayanat.users(user_id),
  submitted_at             timestamptz,
  dpo_opinion_text         text,
  conditions_text          text,
  decided_by_user_id       varchar(100) REFERENCES bayanat.users(user_id),
  decided_at               timestamptz,
  consultation_code        varchar(20) NOT NULL DEFAULT 'NOT_RECORDED' CHECK (consultation_code IN ('NOT_RECORDED', 'NOT_NEEDED', 'SUBMITTED', 'CLEARED')),
  consultation_note_text   text,
  next_review_date         date,
  version_no               integer NOT NULL DEFAULT 0,
  -- What the catalog said about the linked assets when it was last read.
  facts_json               jsonb,
  facts_at                 timestamptz,
  created_by_user_id       varchar(100) REFERENCES bayanat.users(user_id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dpias_status ON bayanat.dpias (status_code);

-- What the assessment is about: catalog assets (source, schema, table, column) and
-- custom assets (CUSTOM:<type_code>). One of them is the subject shown in the register.
CREATE TABLE IF NOT EXISTS bayanat.dpia_assets (
  dpia_id            integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  asset_type_code    varchar(50) NOT NULL,
  asset_id           integer NOT NULL,
  is_subject_indicator boolean NOT NULL DEFAULT false,
  added_by_user_id   varchar(100),
  added_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dpia_id, asset_type_code, asset_id)
);
CREATE INDEX IF NOT EXISTS ix_dpia_assets_asset ON bayanat.dpia_assets (asset_type_code, asset_id);

CREATE TABLE IF NOT EXISTS bayanat.dpia_answers (
  dpia_id            integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  question_id        integer NOT NULL REFERENCES bayanat.dpia_template_questions(question_id) ON DELETE CASCADE,
  answer_code        varchar(10) CHECK (answer_code IN ('YES', 'NO')),
  answer_text        text,
  updated_by_user_id varchar(100),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dpia_id, question_id)
);

-- Likelihood and severity are 1 (low) to 3 (high). Residual = after the measures.
CREATE TABLE IF NOT EXISTS bayanat.dpia_risks (
  risk_id              serial PRIMARY KEY,
  dpia_id              integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  risk_title_text      varchar(300) NOT NULL,
  description_text     text,
  source_flag_code     varchar(40),                     -- the catalog finding it was suggested from
  inherent_likelihood  smallint NOT NULL CHECK (inherent_likelihood BETWEEN 1 AND 3),
  inherent_severity    smallint NOT NULL CHECK (inherent_severity BETWEEN 1 AND 3),
  residual_likelihood  smallint CHECK (residual_likelihood BETWEEN 1 AND 3),
  residual_severity    smallint CHECK (residual_severity BETWEEN 1 AND 3),
  sort_order_int       integer NOT NULL DEFAULT 0,
  created_by_user_id   varchar(100),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dpia_risks_dpia ON bayanat.dpia_risks (dpia_id);

CREATE TABLE IF NOT EXISTS bayanat.dpia_measures (
  measure_id         serial PRIMARY KEY,
  dpia_id            integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  risk_id            integer REFERENCES bayanat.dpia_risks(risk_id) ON DELETE SET NULL,
  measure_text       text NOT NULL,
  owner_user_id      varchar(100) REFERENCES bayanat.users(user_id),
  due_date           date,
  status_code        varchar(20) NOT NULL DEFAULT 'PLANNED' CHECK (status_code IN ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED')),
  completed_date     date,
  note_text          text,
  created_by_user_id varchar(100),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dpia_measures_dpia ON bayanat.dpia_measures (dpia_id);
CREATE INDEX IF NOT EXISTS ix_dpia_measures_owner ON bayanat.dpia_measures (owner_user_id);

-- The whole assessment as it stood at a decision. Never changed afterwards.
CREATE TABLE IF NOT EXISTS bayanat.dpia_versions (
  version_id         serial PRIMARY KEY,
  dpia_id            integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  version_no         integer NOT NULL,
  decision_code      varchar(30) NOT NULL,
  snapshot_json      jsonb NOT NULL,
  created_by_user_id varchar(100),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dpia_id, version_no)
);

CREATE TABLE IF NOT EXISTS bayanat.dpia_events (
  event_id     serial PRIMARY KEY,
  dpia_id      integer NOT NULL REFERENCES bayanat.dpias(dpia_id) ON DELETE CASCADE,
  event_code   varchar(30) NOT NULL,
  note_text    text,
  user_id      varchar(100),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dpia_events_dpia ON bayanat.dpia_events (dpia_id, created_at);

CREATE SEQUENCE IF NOT EXISTS bayanat.dpia_reference_seq;

-- ── Templates ────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _tpl186 (code text, name text, name_ar text, regulation text, regulation_ar text, description text, description_ar text, threshold int, is_default boolean, ord int) ON COMMIT DROP;
INSERT INTO _tpl186 VALUES
  ('PDPL', 'Saudi PDPL', 'نظام حماية البيانات الشخصية', 'Personal Data Protection Law and its Implementing Regulation (impact assessment)', 'نظام حماية البيانات الشخصية ولائحته التنفيذية (تقييم الأثر)', 'An assessment is required as soon as one screening case applies.', 'يلزم التقييم متى انطبقت حالة واحدة من حالات الفحص.', 1, true, 1),
  ('GDPR', 'GDPR Article 35', 'اللائحة العامة لحماية البيانات - المادة 35', 'General Data Protection Regulation, Articles 35 and 36, and the WP248 screening criteria', 'اللائحة العامة لحماية البيانات، المادتان 35 و36، ومعايير الفحص في الإرشاد WP248', 'An assessment is required when two or more screening criteria are met.', 'يلزم التقييم عند تحقق معيارين أو أكثر من معايير الفحص.', 2, false, 2);

INSERT INTO bayanat.dpia_templates (template_code, template_name_text, regulation_text, description_text, screening_threshold_int, is_default_indicator, sort_order_int)
SELECT code, name, regulation, description, threshold, is_default, ord FROM _tpl186
ON CONFLICT (template_code) DO NOTHING;

CREATE TEMP TABLE _q186 (template_code text, question_code text, stage_code text, section_code text, question_text text, question_ar text, help_text text, help_ar text, reference_text text, auto_code text, is_required boolean, ord int) ON COMMIT DROP;
INSERT INTO _q186 VALUES
  ('PDPL', 'S_SENSITIVE', 'SCREENING', 'SCREENING', 'Does the processing involve sensitive personal data?', 'هل تتضمن المعالجة بيانات شخصية حساسة؟', 'For example health, genetic, biometric, credit, religious belief, ethnic origin or criminal record data.', 'مثل البيانات الصحية أو الوراثية أو الحيوية أو الائتمانية أو المعتقد الديني أو الأصل العرقي أو السوابق الجنائية.', 'PDPL Implementing Regulation, impact assessment cases', 'SENSITIVE_PI', false, 1),
  ('PDPL', 'S_LINKING', 'SCREENING', 'SCREENING', 'Does it collect, compare or link two or more sets of personal data obtained from different sources?', 'هل تتضمن جمع مجموعتين أو أكثر من البيانات الشخصية من مصادر مختلفة أو مقارنتها أو ربطها؟', NULL, NULL, 'PDPL Implementing Regulation, impact assessment cases', 'MULTI_SOURCE', false, 2),
  ('PDPL', 'S_INCAPACITY', 'SCREENING', 'SCREENING', 'Does it process, on a large scale or repeatedly, personal data of people who fully or partly lack legal capacity?', 'هل تتضمن معالجة واسعة النطاق أو متكررة لبيانات شخصية لناقصي الأهلية أو عديميها؟', 'For example minors.', 'مثل القاصرين.', 'PDPL Implementing Regulation, impact assessment cases', NULL, false, 3),
  ('PDPL', 'S_MONITORING', 'SCREENING', 'SCREENING', 'Does it involve continuous monitoring of data subjects?', 'هل تتضمن مراقبة مستمرة لأصحاب البيانات الشخصية؟', NULL, NULL, 'PDPL Implementing Regulation, impact assessment cases', NULL, false, 4),
  ('PDPL', 'S_NEW_TECH', 'SCREENING', 'SCREENING', 'Does it process personal data using new technologies?', 'هل تُعالج البيانات الشخصية باستخدام تقنيات حديثة؟', NULL, NULL, 'PDPL Implementing Regulation, impact assessment cases', NULL, false, 5),
  ('PDPL', 'S_AUTOMATED', 'SCREENING', 'SCREENING', 'Are decisions about people made by automated processing of their personal data?', 'هل تُتخذ قرارات بشأن الأفراد بناءً على معالجة آلية لبياناتهم الشخصية؟', NULL, NULL, 'PDPL Implementing Regulation, impact assessment cases', NULL, false, 6),
  ('PDPL', 'S_HIGH_RISK', 'SCREENING', 'SCREENING', 'Is this a product or service likely to cause a high risk to the privacy of data subjects?', 'هل هذا منتج أو خدمة يُحتمل أن يسبب خطراً عالياً على خصوصية أصحاب البيانات الشخصية؟', 'Consider the number of people affected and how much harm misuse or a breach would cause.', 'انظر إلى عدد الأفراد المتأثرين ومقدار الضرر الذي قد ينتج عن إساءة الاستخدام أو التسريب.', 'PDPL Implementing Regulation, impact assessment cases', 'LARGE_SCALE', false, 7),
  ('PDPL', 'S_TRANSFER', 'SCREENING', 'SCREENING', 'Will personal data be transferred or disclosed to a party outside the Kingdom?', 'هل ستُنقل البيانات الشخصية أو يُفصح عنها لجهة خارج المملكة؟', NULL, NULL, 'Regulation on Personal Data Transfer outside the Kingdom', 'CROSS_BORDER', false, 8),
  ('GDPR', 'S_SCORING', 'SCREENING', 'SCREENING', 'Does it evaluate or score people, including profiling and predicting?', 'هل تتضمن تقييم الأفراد أو تصنيفهم بالدرجات، بما في ذلك التنميط والتنبؤ؟', NULL, NULL, 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 1),
  ('GDPR', 'S_AUTOMATED', 'SCREENING', 'SCREENING', 'Does it make automated decisions with legal or similarly significant effect on people?', 'هل تُتخذ قرارات آلية لها أثر قانوني أو أثر مهم مماثل على الأفراد؟', NULL, NULL, 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 2),
  ('GDPR', 'S_MONITORING', 'SCREENING', 'SCREENING', 'Does it systematically monitor people?', 'هل تتضمن مراقبة منهجية للأفراد؟', 'Including monitoring of publicly accessible areas.', 'بما في ذلك مراقبة الأماكن المتاحة للعموم.', 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 3),
  ('GDPR', 'S_SENSITIVE', 'SCREENING', 'SCREENING', 'Does it involve sensitive data or data of a highly personal nature?', 'هل تتضمن بيانات حساسة أو بيانات ذات طابع شخصي بالغ؟', 'Special categories, criminal data, financial data, location data.', 'الفئات الخاصة والبيانات الجنائية والمالية وبيانات الموقع.', 'WP248 rev.01 criteria; GDPR Art. 35(3)', 'SENSITIVE_PI', false, 4),
  ('GDPR', 'S_LARGE_SCALE', 'SCREENING', 'SCREENING', 'Is personal data processed on a large scale?', 'هل تُعالج البيانات الشخصية على نطاق واسع؟', 'Consider the number of people, the volume of data, the duration and the geographic extent.', 'انظر إلى عدد الأفراد وحجم البيانات ومدة المعالجة والامتداد الجغرافي.', 'WP248 rev.01 criteria; GDPR Art. 35(3)', 'LARGE_SCALE', false, 5),
  ('GDPR', 'S_COMBINING', 'SCREENING', 'SCREENING', 'Does it match or combine datasets collected for different purposes?', 'هل تتضمن مطابقة أو دمج مجموعات بيانات جُمعت لأغراض مختلفة؟', NULL, NULL, 'WP248 rev.01 criteria; GDPR Art. 35(3)', 'MULTI_SOURCE', false, 6),
  ('GDPR', 'S_VULNERABLE', 'SCREENING', 'SCREENING', 'Does it concern vulnerable data subjects?', 'هل تتعلق بأصحاب بيانات من الفئات الضعيفة؟', 'For example children, employees, patients or the elderly.', 'مثل الأطفال أو الموظفين أو المرضى أو كبار السن.', 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 7),
  ('GDPR', 'S_INNOVATIVE', 'SCREENING', 'SCREENING', 'Does it use new technology or apply existing technology in a new way?', 'هل تستخدم تقنية جديدة أو تطبّق تقنية قائمة بطريقة جديدة؟', NULL, NULL, 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 8),
  ('GDPR', 'S_BLOCKING', 'SCREENING', 'SCREENING', 'Could the processing prevent people from exercising a right or using a service or contract?', 'هل يمكن أن تمنع المعالجة الأفراد من ممارسة حق أو من الاستفادة من خدمة أو عقد؟', NULL, NULL, 'WP248 rev.01 criteria; GDPR Art. 35(3)', NULL, false, 9),
  ('PDPL', 'A_PURPOSE', 'ASSESSMENT', 'DESCRIPTION', 'What is the purpose of the processing?', 'ما الغرض من المعالجة؟', 'What the organisation wants to achieve and who benefits.', 'ما الذي تريد الجهة تحقيقه ومن المستفيد.', NULL, 'SUBJECT', true, 100),
  ('PDPL', 'A_LEGAL_BASIS', 'ASSESSMENT', 'DESCRIPTION', 'What is the legal basis for the processing?', 'ما الأساس النظامي للمعالجة؟', 'For example consent, a contract, a legal obligation or a legitimate interest.', 'مثل الموافقة أو العقد أو الالتزام النظامي أو المصلحة المشروعة.', NULL, 'LEGAL_BASIS', true, 101),
  ('PDPL', 'A_DATA', 'ASSESSMENT', 'DESCRIPTION', 'What personal data is processed, and about which groups of people?', 'ما البيانات الشخصية التي تُعالج، وعن أي فئات من الأفراد؟', 'The categories of data and of data subjects (customers, employees, patients, minors).', 'فئات البيانات وفئات أصحابها (عملاء، موظفون، مرضى، قاصرون).', NULL, 'PERSONAL_DATA', true, 102),
  ('PDPL', 'A_NATURE', 'ASSESSMENT', 'DESCRIPTION', 'How is the data collected, used, stored and who can access it?', 'كيف تُجمع البيانات وتُستخدم وتُخزَّن، ومن يستطيع الوصول إليها؟', NULL, NULL, NULL, 'ACCESS', false, 103),
  ('PDPL', 'A_SCALE', 'ASSESSMENT', 'DESCRIPTION', 'What is the scale of the processing?', 'ما حجم المعالجة ونطاقها؟', 'Number of people, volume of records, how often, and the geographic area covered.', 'عدد الأفراد وحجم السجلات وتكرار المعالجة والنطاق الجغرافي.', NULL, 'SCALE', false, 104),
  ('PDPL', 'A_FLOWS', 'ASSESSMENT', 'DESCRIPTION', 'Which systems hold or receive copies of the data?', 'ما الأنظمة التي تحتفظ بالبيانات أو تتلقى نسخاً منها؟', NULL, NULL, NULL, 'FLOWS', false, 105),
  ('PDPL', 'A_RECIPIENTS', 'ASSESSMENT', 'DESCRIPTION', 'Who receives the data, including processors and any transfer outside the country?', 'من يتلقى البيانات، بمن فيهم جهات المعالجة وأي نقل إلى خارج الدولة؟', NULL, NULL, NULL, 'RECIPIENTS', false, 106),
  ('PDPL', 'A_RETENTION', 'ASSESSMENT', 'DESCRIPTION', 'How long is the data kept, and how is it disposed of?', 'كم مدة الاحتفاظ بالبيانات، وكيف يجري إتلافها؟', NULL, NULL, NULL, 'RETENTION', false, 107),
  ('PDPL', 'A_NECESSITY', 'ASSESSMENT', 'NECESSITY', 'Is the processing necessary to achieve the purpose, and is there a less intrusive way?', 'هل المعالجة ضرورية لتحقيق الغرض، وهل توجد طريقة أقل مساساً بالخصوصية؟', NULL, NULL, NULL, NULL, true, 108),
  ('PDPL', 'A_MINIMISATION', 'ASSESSMENT', 'NECESSITY', 'Is the data limited to what the purpose needs, and how is it kept accurate?', 'هل تقتصر البيانات على ما يحتاجه الغرض، وكيف تُحفظ دقتها؟', NULL, NULL, NULL, NULL, false, 109),
  ('PDPL', 'A_RIGHTS', 'ASSESSMENT', 'NECESSITY', 'How are people informed, and how can they exercise their rights?', 'كيف يُبلَّغ الأفراد، وكيف يمارسون حقوقهم؟', 'Privacy notice, access, correction, deletion and objection.', 'إشعار الخصوصية والوصول والتصحيح والحذف والاعتراض.', NULL, NULL, false, 110),
  ('PDPL', 'A_PROCESSORS', 'ASSESSMENT', 'NECESSITY', 'How are processors and recipients bound to protect the data?', 'كيف تُلزَم جهات المعالجة والجهات المتلقية بحماية البيانات؟', 'Contracts, sharing agreements, audits.', 'العقود واتفاقيات المشاركة والتدقيق.', NULL, 'RECIPIENTS', false, 111),
  ('PDPL', 'A_CONSULTATION', 'ASSESSMENT', 'CONSULTATION', 'Whose views were sought, and what did they say?', 'من الذين أُخذ رأيهم، وماذا كان رأيهم؟', 'Data subjects or their representatives, information security, legal. If nobody was consulted, say why.', 'أصحاب البيانات أو ممثلوهم، وأمن المعلومات، والشؤون القانونية. وإن لم يُستشر أحد فاذكر السبب.', NULL, NULL, false, 112),
  ('GDPR', 'A_PURPOSE', 'ASSESSMENT', 'DESCRIPTION', 'What is the purpose of the processing?', 'ما الغرض من المعالجة؟', 'What the organisation wants to achieve and who benefits.', 'ما الذي تريد الجهة تحقيقه ومن المستفيد.', NULL, 'SUBJECT', true, 100),
  ('GDPR', 'A_LEGAL_BASIS', 'ASSESSMENT', 'DESCRIPTION', 'What is the legal basis for the processing?', 'ما الأساس النظامي للمعالجة؟', 'For example consent, a contract, a legal obligation or a legitimate interest.', 'مثل الموافقة أو العقد أو الالتزام النظامي أو المصلحة المشروعة.', NULL, 'LEGAL_BASIS', true, 101),
  ('GDPR', 'A_DATA', 'ASSESSMENT', 'DESCRIPTION', 'What personal data is processed, and about which groups of people?', 'ما البيانات الشخصية التي تُعالج، وعن أي فئات من الأفراد؟', 'The categories of data and of data subjects (customers, employees, patients, minors).', 'فئات البيانات وفئات أصحابها (عملاء، موظفون، مرضى، قاصرون).', NULL, 'PERSONAL_DATA', true, 102),
  ('GDPR', 'A_NATURE', 'ASSESSMENT', 'DESCRIPTION', 'How is the data collected, used, stored and who can access it?', 'كيف تُجمع البيانات وتُستخدم وتُخزَّن، ومن يستطيع الوصول إليها؟', NULL, NULL, NULL, 'ACCESS', false, 103),
  ('GDPR', 'A_SCALE', 'ASSESSMENT', 'DESCRIPTION', 'What is the scale of the processing?', 'ما حجم المعالجة ونطاقها؟', 'Number of people, volume of records, how often, and the geographic area covered.', 'عدد الأفراد وحجم السجلات وتكرار المعالجة والنطاق الجغرافي.', NULL, 'SCALE', false, 104),
  ('GDPR', 'A_FLOWS', 'ASSESSMENT', 'DESCRIPTION', 'Which systems hold or receive copies of the data?', 'ما الأنظمة التي تحتفظ بالبيانات أو تتلقى نسخاً منها؟', NULL, NULL, NULL, 'FLOWS', false, 105),
  ('GDPR', 'A_RECIPIENTS', 'ASSESSMENT', 'DESCRIPTION', 'Who receives the data, including processors and any transfer outside the country?', 'من يتلقى البيانات، بمن فيهم جهات المعالجة وأي نقل إلى خارج الدولة؟', NULL, NULL, NULL, 'RECIPIENTS', false, 106),
  ('GDPR', 'A_RETENTION', 'ASSESSMENT', 'DESCRIPTION', 'How long is the data kept, and how is it disposed of?', 'كم مدة الاحتفاظ بالبيانات، وكيف يجري إتلافها؟', NULL, NULL, NULL, 'RETENTION', false, 107),
  ('GDPR', 'A_NECESSITY', 'ASSESSMENT', 'NECESSITY', 'Is the processing necessary to achieve the purpose, and is there a less intrusive way?', 'هل المعالجة ضرورية لتحقيق الغرض، وهل توجد طريقة أقل مساساً بالخصوصية؟', NULL, NULL, NULL, NULL, true, 108),
  ('GDPR', 'A_MINIMISATION', 'ASSESSMENT', 'NECESSITY', 'Is the data limited to what the purpose needs, and how is it kept accurate?', 'هل تقتصر البيانات على ما يحتاجه الغرض، وكيف تُحفظ دقتها؟', NULL, NULL, NULL, NULL, false, 109),
  ('GDPR', 'A_RIGHTS', 'ASSESSMENT', 'NECESSITY', 'How are people informed, and how can they exercise their rights?', 'كيف يُبلَّغ الأفراد، وكيف يمارسون حقوقهم؟', 'Privacy notice, access, correction, deletion and objection.', 'إشعار الخصوصية والوصول والتصحيح والحذف والاعتراض.', NULL, NULL, false, 110),
  ('GDPR', 'A_PROCESSORS', 'ASSESSMENT', 'NECESSITY', 'How are processors and recipients bound to protect the data?', 'كيف تُلزَم جهات المعالجة والجهات المتلقية بحماية البيانات؟', 'Contracts, sharing agreements, audits.', 'العقود واتفاقيات المشاركة والتدقيق.', NULL, 'RECIPIENTS', false, 111),
  ('GDPR', 'A_CONSULTATION', 'ASSESSMENT', 'CONSULTATION', 'Whose views were sought, and what did they say?', 'من الذين أُخذ رأيهم، وماذا كان رأيهم؟', 'Data subjects or their representatives, information security, legal. If nobody was consulted, say why.', 'أصحاب البيانات أو ممثلوهم، وأمن المعلومات، والشؤون القانونية. وإن لم يُستشر أحد فاذكر السبب.', NULL, NULL, false, 112);

INSERT INTO bayanat.dpia_template_questions (template_id, question_code, stage_code, section_code, question_text, help_text, reference_text, auto_code, is_required_indicator, sort_order_int)
SELECT t.template_id, n.question_code, n.stage_code, n.section_code, n.question_text, n.help_text, n.reference_text, n.auto_code, n.is_required, n.ord
FROM _q186 n JOIN bayanat.dpia_templates t ON t.template_code = n.template_code
ON CONFLICT (template_id, question_code) DO NOTHING;

-- Arabic for the template content, in the translation tables the Workbench edits.
INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code) VALUES
  ('DPIA_TEMPLATES', 'Impact Assessment Templates', 'LIST')
ON CONFLICT (category_code) DO NOTHING;

CREATE TEMP TABLE _tr186 (key_code text, category_code text, base_text text, ar_text text) ON COMMIT DROP;

INSERT INTO _tr186
SELECT 'dpia_templates.' || t.template_id || '.' || f.suffix, 'DPIA_TEMPLATES', f.base_text, f.ar_text
FROM _tpl186 n JOIN bayanat.dpia_templates t ON t.template_code = n.code
CROSS JOIN LATERAL (VALUES ('name', n.name, n.name_ar), ('regulation', n.regulation, n.regulation_ar), ('description', n.description, n.description_ar)) AS f(suffix, base_text, ar_text);

INSERT INTO _tr186
SELECT 'dpia_template_questions.' || qq.question_id || '.' || f.suffix, 'DPIA_TEMPLATES', f.base_text, f.ar_text
FROM _q186 n
JOIN bayanat.dpia_templates t ON t.template_code = n.template_code
JOIN bayanat.dpia_template_questions qq ON qq.template_id = t.template_id AND qq.question_code = n.question_code
CROSS JOIN LATERAL (VALUES ('text', n.question_text, n.question_ar), ('help', n.help_text, n.help_ar)) AS f(suffix, base_text, ar_text)
WHERE f.base_text IS NOT NULL;

-- ── Activity custom asset type: the fields an assessment reads ───────────────
CREATE TEMP TABLE _attr186 (attr_code text, attr_name text, name_ar text, data_type text, ord int) ON COMMIT DROP;
INSERT INTO _attr186 VALUES
  ('DATA_SUBJECTS', 'Data Subject Categories', 'فئات أصحاب البيانات', 'TEXT', 4),
  ('CROSS_BORDER', 'Transferred Outside the Country', 'نقل إلى خارج الدولة', 'BOOLEAN', 5),
  ('TRANSFER_COUNTRIES', 'Destination Countries', 'دول الوجهة', 'TEXT', 6),
  ('RETENTION_PERIOD', 'Retention Period', 'مدة الاحتفاظ', 'TEXT', 7);

INSERT INTO bayanat.custom_asset_type_attributes (type_id, attr_code, attr_name_text, name_ar_text, data_type_code, is_required_indicator, is_unique_indicator, display_order_int)
SELECT t.type_id, n.attr_code, n.attr_name, n.name_ar, n.data_type, false, false, n.ord
FROM _attr186 n JOIN bayanat.custom_asset_types t ON t.type_code = 'ACTIVITY'
ON CONFLICT (type_id, attr_code) DO NOTHING;

INSERT INTO _tr186
SELECT 'custom_asset_attrs.' || a.attr_def_id || '.name', 'CUSTOM_ASSET_ATTRS', a.attr_name_text, n.name_ar
FROM _attr186 n
JOIN bayanat.custom_asset_types t ON t.type_code = 'ACTIVITY'
JOIN bayanat.custom_asset_type_attributes a ON a.type_id = t.type_id AND a.attr_code = n.attr_code;

-- Who an activity's data is shared with (the Customer type ships with the framework).
INSERT INTO bayanat.custom_relationship_types (rel_code, rel_name_text, name_ar_text, inverse_name_text, inverse_name_ar_text, from_endpoint_json, to_endpoint_json, cardinality_code)
SELECT 'SHARED_WITH', 'Shared With', 'يُشارك مع', 'Receives data from', 'يتلقى بيانات من', '["CUSTOM:ACTIVITY"]'::jsonb, '["CUSTOM:CUSTOMER"]'::jsonb, 'M:N'
WHERE EXISTS (SELECT 1 FROM bayanat.custom_asset_types WHERE type_code = 'ACTIVITY')
  AND EXISTS (SELECT 1 FROM bayanat.custom_asset_types WHERE type_code = 'CUSTOMER')
ON CONFLICT (rel_code) DO NOTHING;

INSERT INTO _tr186
SELECT 'custom_relationship_types.' || r.rel_type_id || '.' || f.suffix, 'CUSTOM_RELATIONSHIP_TYPES', f.base_text, f.ar_text
FROM bayanat.custom_relationship_types r
CROSS JOIN LATERAL (VALUES ('name', r.rel_name_text, 'يُشارك مع'), ('inverse_name', r.inverse_name_text, 'يتلقى بيانات من')) AS f(suffix, base_text, ar_text)
WHERE r.rel_code = 'SHARED_WITH' AND r.rel_name_text = 'Shared With';

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text)
SELECT category_code, key_code, base_text FROM _tr186
ON CONFLICT (key_code) DO UPDATE SET base_text = EXCLUDED.base_text;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', n.ar_text, 'VERIFIED', now(), now()
FROM _tr186 n
JOIN bayanat.translation_keys tk ON tk.key_code = n.key_code
WHERE n.ar_text IS NOT NULL
ON CONFLICT (key_id, language_code) DO UPDATE
  SET translated_text = EXCLUDED.translated_text, status_code = 'VERIFIED', translated_at = now(), verified_at = now();

COMMIT;
