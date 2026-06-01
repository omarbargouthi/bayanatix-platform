-- ═══════════════════════════════════════════════════════════════════════════════
-- 039_data_retention.sql
-- Data Retention feature: categories, schedules, legal holds + seed data
-- Based on GDPR, PDPL (SDAIA/Saudi Arabia), ZATCA, NCA, Saudi Labour Law, MOH
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Data Categories (Classification / Taxonomy Module) ────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.data_categories (
  category_id    SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  name_ar        TEXT,
  parent_id      INT  REFERENCES bayanat.data_categories(category_id) ON DELETE SET NULL,
  sensitivity    TEXT NOT NULL DEFAULT 'INTERNAL',   -- PUBLIC INTERNAL CONFIDENTIAL RESTRICTED
  description    TEXT,
  description_ar TEXT,
  examples       TEXT,
  sort_order     INT  NOT NULL DEFAULT 0,
  is_active      BOOL NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_categories_parent ON bayanat.data_categories(parent_id);

-- ── Retention Schedules (child of Data Category, per jurisdiction) ────────────

CREATE TABLE IF NOT EXISTS bayanat.retention_schedules (
  schedule_id           SERIAL PRIMARY KEY,
  category_id           INT  NOT NULL REFERENCES bayanat.data_categories(category_id) ON DELETE CASCADE,
  jurisdiction          TEXT NOT NULL DEFAULT 'KSA',
  trigger_event         TEXT NOT NULL DEFAULT 'CREATION_DATE',
  -- CREATION_DATE | LAST_MODIFIED | CONTRACT_END | EMPLOYEE_TERMINATION |
  -- ACCOUNT_CLOSURE | LAST_TRANSACTION | CUSTOM
  trigger_custom_expr   TEXT,
  retention_period      INT  NOT NULL,
  retention_unit        TEXT NOT NULL DEFAULT 'YEARS',  -- DAYS | MONTHS | YEARS
  post_retention_action TEXT NOT NULL DEFAULT 'DELETE',  -- DELETE | ARCHIVE | ANONYMIZE | REVIEW
  archive_location      TEXT,
  regulatory_reference  TEXT,
  notes                 TEXT,
  is_default            BOOL NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_schedules_category ON bayanat.retention_schedules(category_id);

-- ── Legal Holds (first-class entity) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.legal_holds (
  hold_id               SERIAL PRIMARY KEY,
  case_reference        TEXT NOT NULL,
  case_name             TEXT NOT NULL,
  hold_scope_type       TEXT NOT NULL DEFAULT 'CATEGORY',   -- CATEGORY | CATALOG_ITEMS
  hold_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  release_date          DATE,
  hold_status           TEXT NOT NULL DEFAULT 'ACTIVE',     -- ACTIVE | RELEASED | EXPIRED
  placed_by             TEXT REFERENCES bayanat.users(user_id),
  release_authority     TEXT REFERENCES bayanat.users(user_id),
  release_justification TEXT,
  notes                 TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ── Legal Hold ↔ Category junction ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.legal_hold_categories (
  hold_id     INT NOT NULL REFERENCES bayanat.legal_holds(hold_id) ON DELETE CASCADE,
  category_id INT NOT NULL REFERENCES bayanat.data_categories(category_id) ON DELETE CASCADE,
  PRIMARY KEY (hold_id, category_id)
);

-- ── Extend Business Glossary ──────────────────────────────────────────────────

ALTER TABLE bayanat.business_glossaries
  ADD COLUMN IF NOT EXISTS retention_category_id INT REFERENCES bayanat.data_categories(category_id);

-- ── Extend Data Entities with retention metadata ──────────────────────────────

ALTER TABLE bayanat.data_entities
  ADD COLUMN IF NOT EXISTS retention_category_id   INT REFERENCES bayanat.data_categories(category_id),
  ADD COLUMN IF NOT EXISTS retention_status        TEXT DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS effective_expiry_date   DATE,
  ADD COLUMN IF NOT EXISTS last_retention_check    TIMESTAMP;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEED DATA — Common Data Categories & Retention Schedules
-- Sources: GDPR, PDPL (SDAIA), ZATCA, NCA ECC, Saudi Labour Law,
--          Saudi Companies Law, Saudi MOH, Saudi Civil Transactions Law,
--          Saudi Drug Authority Regulations
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ROOT CATEGORIES
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (1,  'Financial Records',
       'السجلات المالية',
       NULL, 'CONFIDENTIAL',
       'Financial and accounting records including invoices, statements, and reports.',
       'السجلات المالية والمحاسبية بما تشمل الفواتير وكشوف الحسابات والتقارير.',
       'Invoices, bank statements, tax returns, financial reports, audit trails',
       10),

  (2,  'Customer & Personal Data',
       'بيانات العملاء والبيانات الشخصية',
       NULL, 'CONFIDENTIAL',
       'All data relating to identified or identifiable customers and individuals.',
       'جميع البيانات المتعلقة بالعملاء والأفراد المحددة هوياتهم أو القابلين للتحديد.',
       'Customer profiles, contact details, purchase history, account data',
       20),

  (3,  'Employee & HR Data',
       'بيانات الموظفين والموارد البشرية',
       NULL, 'CONFIDENTIAL',
       'Personnel records, payroll, benefits, attendance, and recruitment data.',
       'سجلات الموظفين والرواتب والمزايا والحضور وبيانات التوظيف.',
       'Employee files, payslips, leave records, performance reviews, CVs',
       30),

  (4,  'Healthcare & Medical Data',
       'البيانات الصحية والطبية',
       NULL, 'RESTRICTED',
       'Patient health information, medical history, clinical records, and prescriptions.',
       'المعلومات الصحية للمرضى والسجلات الطبية والوصفات الطبية.',
       'Patient records, diagnoses, medication history, lab results, imaging',
       40),

  (5,  'Legal & Compliance Records',
       'السجلات القانونية والامتثال',
       NULL, 'RESTRICTED',
       'Contracts, legal filings, litigation documents, and regulatory submissions.',
       'العقود والوثائق القانونية ومستندات التقاضي والتقديمات التنظيمية.',
       'Contracts, court filings, compliance reports, regulatory correspondence',
       50),

  (6,  'IT & Security Records',
       'سجلات تقنية المعلومات والأمن',
       NULL, 'INTERNAL',
       'System logs, access logs, security events, and incident records.',
       'سجلات الأنظمة وسجلات الوصول وأحداث الأمن وسجلات الحوادث.',
       'System logs, access logs, security alerts, incident reports, change logs',
       60),

  (7,  'Operational & Business Data',
       'البيانات التشغيلية والأعمال',
       NULL, 'INTERNAL',
       'Day-to-day operational records, transactions, and business communications.',
       'سجلات العمليات اليومية والمعاملات والمراسلات التجارية.',
       'Transaction logs, operational reports, business emails, project records',
       70),

  (8,  'Third-Party & Partner Data',
       'بيانات الأطراف الثالثة والشركاء',
       NULL, 'CONFIDENTIAL',
       'Data received from or shared with vendors, suppliers, and business partners.',
       'البيانات المستلمة من أو المشتركة مع الموردين والشركاء التجاريين.',
       'Vendor contracts, supplier invoices, partner API data, outsourcing records',
       80)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — Financial Records (parent=1)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (11, 'VAT & Tax Invoices',
       'فواتير ضريبة القيمة المضافة والضرائب',
       1, 'CONFIDENTIAL',
       'VAT invoices, credit notes, and tax-related financial documents.',
       'فواتير ضريبة القيمة المضافة وإشعارات الدائن والوثائق الضريبية.',
       'VAT invoices, credit notes, debit notes, tax returns',
       11),

  (12, 'Bank Statements & Transfers',
       'كشوف الحسابات البنكية والتحويلات',
       1, 'CONFIDENTIAL',
       'Bank account statements, wire transfers, and reconciliation records.',
       'كشوف الحسابات البنكية والتحويلات المصرفية وسجلات المطابقة.',
       'Bank statements, transfer confirmations, reconciliation reports',
       12),

  (13, 'Financial Reports & Audits',
       'التقارير المالية والتدقيق',
       1, 'CONFIDENTIAL',
       'Annual financial statements, audit reports, and management accounts.',
       'البيانات المالية السنوية وتقارير التدقيق وحسابات الإدارة.',
       'Annual reports, audit findings, balance sheets, P&L statements',
       13)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — Customer & Personal Data (parent=2)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (21, 'Customer PII',
       'البيانات الشخصية للعملاء',
       2, 'CONFIDENTIAL',
       'Personal identifiable information: names, IDs, contact details, and addresses.',
       'المعلومات الشخصية التعريفية: الأسماء وأرقام الهوية ومعلومات الاتصال والعناوين.',
       'Full name, national ID, phone, email, home address',
       21),

  (22, 'Customer Contracts & Agreements',
       'عقود العملاء والاتفاقيات',
       2, 'CONFIDENTIAL',
       'Service agreements, terms accepted, and customer-signed contracts.',
       'اتفاقيات الخدمة والشروط المقبولة والعقود الموقعة من العملاء.',
       'Service agreements, SLAs, terms acceptance logs',
       22),

  (23, 'Marketing & Consent Data',
       'بيانات التسويق والموافقة',
       2, 'CONFIDENTIAL',
       'Marketing preferences, consent records, and subscription data.',
       'تفضيلات التسويق وسجلات الموافقة وبيانات الاشتراك.',
       'Email opt-ins, consent timestamps, campaign responses',
       23)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — Employee & HR Data (parent=3)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (31, 'Employee Personal Records',
       'السجلات الشخصية للموظفين',
       3, 'CONFIDENTIAL',
       'Personal details, ID documents, and employment history of current and former employees.',
       'التفاصيل الشخصية ووثائق الهوية والتاريخ الوظيفي للموظفين الحاليين والسابقين.',
       'Employee ID, national ID copy, employment contract, job title history',
       31),

  (32, 'Payroll & Compensation Records',
       'سجلات الرواتب والتعويضات',
       3, 'CONFIDENTIAL',
       'Payroll data, salary details, GOSI contributions, and end-of-service benefits.',
       'بيانات الرواتب والمزايا واشتراكات التأمينات الاجتماعية ومكافآت نهاية الخدمة.',
       'Monthly payslips, salary changes, GOSI records, EOSB calculations',
       32),

  (33, 'Attendance & Leave Records',
       'سجلات الحضور والإجازات',
       3, 'INTERNAL',
       'Time and attendance data, leave requests, approvals, and balances.',
       'بيانات الوقت والحضور وطلبات الإجازات والموافقات والأرصدة.',
       'Attendance logs, leave requests, sick leave records, overtime records',
       33),

  (34, 'Recruitment & Selection Records',
       'سجلات التوظيف والاختيار',
       3, 'CONFIDENTIAL',
       'Job applications, CVs, interview records, and assessment results.',
       'طلبات التوظيف والسير الذاتية وسجلات المقابلات ونتائج التقييم.',
       'CVs/resumes, interview notes, reference checks, offer letters',
       34),

  (35, 'Performance & Development Records',
       'سجلات الأداء والتطوير',
       3, 'CONFIDENTIAL',
       'Performance reviews, KPI results, disciplinary records, and training records.',
       'مراجعات الأداء ونتائج مؤشرات الأداء الرئيسية وسجلات التأديب والتدريب.',
       'Performance appraisals, disciplinary actions, training certificates',
       35)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — Healthcare (parent=4)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (41, 'Patient Medical Records',
       'السجلات الطبية للمرضى',
       4, 'RESTRICTED',
       'Complete patient health records including diagnoses, treatments, and history.',
       'سجلات صحة المريض الكاملة بما تشمل التشخيصات والعلاجات والتاريخ المرضي.',
       'Clinical notes, diagnosis codes, treatment plans, discharge summaries',
       41),

  (42, 'Prescription & Medication Records',
       'سجلات الوصفات الطبية والأدوية',
       4, 'RESTRICTED',
       'Drug prescriptions, dispensing records, and medication history.',
       'الوصفات الطبية وسجلات الصرف والتاريخ الدوائي للمريض.',
       'Prescriptions, pharmacy dispensing logs, medication history',
       42)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — Legal & Compliance (parent=5)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (51, 'Contracts & Agreements',
       'العقود والاتفاقيات',
       5, 'RESTRICTED',
       'All signed contracts with customers, vendors, employees, and partners.',
       'جميع العقود الموقعة مع العملاء والموردين والموظفين والشركاء.',
       'Service agreements, NDAs, employment contracts, supplier contracts',
       51),

  (52, 'Litigation & Legal Records',
       'وثائق التقاضي والسجلات القانونية',
       5, 'RESTRICTED',
       'Court filings, legal correspondence, case records, and judgments.',
       'الوثائق القضائية والمراسلات القانونية وسجلات القضايا والأحكام.',
       'Court orders, legal notices, arbitration records, settlement documents',
       52),

  (53, 'Regulatory Filings & Correspondence',
       'الإيداعات التنظيمية والمراسلات',
       5, 'CONFIDENTIAL',
       'Submissions to regulators, licensing records, and compliance reports.',
       'المقدمات للجهات التنظيمية وسجلات الترخيص وتقارير الامتثال.',
       'ZATCA filings, SAMA submissions, SDAIA registrations, audit responses',
       53)

ON CONFLICT (category_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SUB-CATEGORIES — IT & Security (parent=6)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO bayanat.data_categories
  (category_id, name, name_ar, parent_id, sensitivity, description, description_ar, examples, sort_order)
VALUES
  (61, 'System & Application Logs',
       'سجلات الأنظمة والتطبيقات',
       6, 'INTERNAL',
       'Application error logs, debug logs, and system event logs.',
       'سجلات أخطاء التطبيقات وسجلات تصحيح الأخطاء وسجلات أحداث النظام.',
       'Error logs, debug logs, transaction logs, API call logs',
       61),

  (62, 'Security & Access Logs',
       'سجلات الأمن والوصول',
       6, 'CONFIDENTIAL',
       'User access logs, authentication events, privileged access records.',
       'سجلات وصول المستخدمين وأحداث المصادقة وسجلات الوصول المميز.',
       'Login logs, failed access attempts, admin activity logs, VPN logs',
       62),

  (63, 'Security Incident Records',
       'سجلات الحوادث الأمنية',
       6, 'RESTRICTED',
       'Cybersecurity incident reports, forensic data, and remediation records.',
       'تقارير الحوادث الأمنية وبيانات التحليل الجنائي الرقمي وسجلات المعالجة.',
       'Incident reports, forensic images, threat intelligence, remediation logs',
       63)

ON CONFLICT (category_id) DO NOTHING;

-- Reset sequence to avoid conflicts with future inserts
SELECT setval('bayanat.data_categories_category_id_seq', 100, true);


-- ═══════════════════════════════════════════════════════════════════════════════
-- RETENTION SCHEDULES — Standard Schedules per Category and Jurisdiction
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO bayanat.retention_schedules
  (category_id, jurisdiction, trigger_event, retention_period, retention_unit,
   post_retention_action, archive_location, regulatory_reference, notes, is_default)
VALUES

-- ── Financial Records: VAT & Tax Invoices (cat 11) ─────────────────────────
(11, 'KSA', 'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', 'cold-storage/financial/vat',
  'ZATCA VAT Regulations Art. 66; Saudi Companies Law Art. 52',
  'Minimum 5 years required by ZATCA. Keep original + electronic copy.', TRUE),

(11, 'EU',  'CREATION_DATE', 7, 'YEARS', 'ARCHIVE', 'cold-storage/financial/vat-eu',
  'EU VAT Directive 2006/112/EC Art. 244; GDPR Art. 5(1)(e)',
  'EU standard: 7 years for VAT records across most EU member states.', FALSE),

-- ── Financial Records: Bank Statements (cat 12) ────────────────────────────
(12, 'KSA', 'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', 'cold-storage/financial/bank',
  'SAMA Banking Regulation; Saudi Anti-Money Laundering Law Art. 24',
  'AML regulations require 5-year minimum for all transaction records.', TRUE),

(12, 'EU',  'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', 'cold-storage/financial/bank-eu',
  'EU Anti-Money Laundering Directive (AMLD6); GDPR',
  'AML Directive requires 5 years. May extend to 10 years for high-risk.', FALSE),

-- ── Financial Records: Financial Reports & Audits (cat 13) ─────────────────
(13, 'KSA', 'CREATION_DATE', 10, 'YEARS', 'ARCHIVE', 'cold-storage/financial/reports',
  'Saudi Companies Law Art. 52; SOCPA Accounting Standards',
  'Audited financial statements must be retained for 10 years.', TRUE),

(13, 'Global', 'CREATION_DATE', 7, 'YEARS', 'ARCHIVE', NULL,
  'IFRS Standards; General corporate governance practice',
  'International baseline: 7 years for audited financial statements.', FALSE),

-- ── Customer PII (cat 21) ───────────────────────────────────────────────────
(21, 'KSA', 'ACCOUNT_CLOSURE', 5, 'YEARS', 'ANONYMIZE', NULL,
  'PDPL Art. 21; SDAIA Personal Data Protection Regulation 2021',
  'Retain for 5 years after last transaction/account closure. Anonymize on expiry.', TRUE),

(21, 'EU',  'LAST_TRANSACTION', 3, 'YEARS', 'DELETE', NULL,
  'GDPR Art. 5(1)(e) Storage Limitation; EDPB Guidelines',
  'Minimum necessary period post-relationship. Delete or anonymize.', FALSE),

-- ── Customer Contracts (cat 22) ─────────────────────────────────────────────
(22, 'KSA', 'CONTRACT_END', 10, 'YEARS', 'ARCHIVE', 'cold-storage/legal/contracts',
  'Saudi Civil Transactions Law Art. 103; Saudi Companies Law',
  '10-year statute of limitations applies to contractual claims in KSA.', TRUE),

(22, 'EU',  'CONTRACT_END',  6, 'YEARS', 'ARCHIVE', 'cold-storage/legal/contracts-eu',
  'GDPR; UK Limitation Act 1980; EU Contract Law',
  '6-year limitation period for contract claims in EU/UK.', FALSE),

-- ── Marketing & Consent Data (cat 23) ─────────────────────────────────────
(23, 'KSA', 'LAST_MODIFIED', 1, 'YEARS', 'DELETE', NULL,
  'PDPL Art. 16-20 (Consent Conditions); SDAIA Guidelines',
  'Delete 1 year after consent withdrawn or last interaction.', TRUE),

(23, 'EU',  'LAST_MODIFIED', 1, 'YEARS', 'DELETE', NULL,
  'GDPR Art. 7 (Conditions for Consent); PECR',
  'Delete promptly after consent withdrawal. Max 1 year for compliance evidence.', FALSE),

-- ── Employee Personal Records (cat 31) ────────────────────────────────────
(31, 'KSA', 'EMPLOYEE_TERMINATION', 5, 'YEARS', 'ARCHIVE', 'cold-storage/hr/employees',
  'Saudi Labour Law Art. 4; PDPL; GOSI Regulations',
  'Labour Law requires 5-year retention post-termination. GOSI may require longer.', TRUE),

(31, 'EU',  'EMPLOYEE_TERMINATION', 6, 'YEARS', 'ARCHIVE', 'cold-storage/hr/employees-eu',
  'GDPR; UK Employment Rights Act 1996; EU Labour Directives',
  'Standard 6-year retention in EU/UK post-employment for potential claims.', FALSE),

-- ── Payroll & Compensation (cat 32) ────────────────────────────────────────
(32, 'KSA', 'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', 'cold-storage/hr/payroll',
  'Saudi Labour Law Art. 68; GOSI Regulations; ZATCA',
  'Payroll records must be retained for 5 years for labour disputes and GOSI audits.', TRUE),

(32, 'EU',  'CREATION_DATE', 6, 'YEARS', 'ARCHIVE', 'cold-storage/hr/payroll-eu',
  'GDPR; UK PAYE Regulations; EU Employment Directives',
  '6-year retention required for tax and employment law compliance.', FALSE),

-- ── Attendance & Leave Records (cat 33) ────────────────────────────────────
(33, 'KSA', 'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', NULL,
  'Saudi Labour Law Art. 68; Ministry of Human Resources Guidelines',
  '5 years minimum for attendance records to support potential labour claims.', TRUE),

-- ── Recruitment Records (cat 34) ───────────────────────────────────────────
(34, 'KSA', 'CREATION_DATE', 2, 'YEARS', 'DELETE', NULL,
  'PDPL; Ministry of Human Resources Guidelines; Saudi Labour Law',
  '2 years for unsuccessful candidates. Successful candidates move to employee record.', TRUE),

(34, 'EU',  'CREATION_DATE', 1, 'YEARS', 'DELETE', NULL,
  'GDPR Art. 5(1)(e); EDPB Recruitment Guidelines',
  'GDPR guidance: 1 year for unsuccessful candidates after recruitment ends.', FALSE),

-- ── Performance & Development (cat 35) ────────────────────────────────────
(35, 'KSA', 'EMPLOYEE_TERMINATION', 3, 'YEARS', 'ARCHIVE', NULL,
  'Saudi Labour Law; PDPL; Internal HR Best Practice',
  '3 years post-termination for potential disciplinary appeals or employment disputes.', TRUE),

-- ── Patient Medical Records (cat 41) ──────────────────────────────────────
(41, 'KSA', 'CREATION_DATE', 25, 'YEARS', 'ARCHIVE', 'cold-storage/medical/records',
  'Saudi MOH Circular No. 4456/1; PDPL; Saudi Health Council Regulations',
  'Saudi MOH requires 25-year minimum. For minors: until age 18 + 25 years.', TRUE),

(41, 'EU',  'CREATION_DATE', 10, 'YEARS', 'ARCHIVE', 'cold-storage/medical/records-eu',
  'GDPR Art. 9; EU Medical Device Regulation; National Healthcare Laws',
  'Varies by country: 10-30 years. GDPR requires explicit purpose justification.', FALSE),

-- ── Prescription Records (cat 42) ─────────────────────────────────────────
(42, 'KSA', 'CREATION_DATE', 5, 'YEARS', 'ARCHIVE', 'cold-storage/medical/rx',
  'Saudi Drug Authority (SFDA) Regulations; Saudi MOH',
  'SFDA requires pharmacy dispensing records for minimum 5 years.', TRUE),

-- ── Contracts & Agreements (cat 51) ────────────────────────────────────────
(51, 'KSA', 'CONTRACT_END', 10, 'YEARS', 'ARCHIVE', 'cold-storage/legal/contracts',
  'Saudi Civil Transactions Law Art. 103; Saudi Companies Law Art. 52',
  '10-year statute of limitations for contractual claims. Archive original copies.', TRUE),

(51, 'EU',  'CONTRACT_END',  6, 'YEARS', 'ARCHIVE', 'cold-storage/legal/contracts-eu',
  'GDPR; UK Limitation Act 1980; EU Contract Law Principles',
  '6-year limitation period for contractual claims in most EU jurisdictions.', FALSE),

-- ── Litigation Records (cat 52) ────────────────────────────────────────────
(52, 'KSA', 'CUSTOM',       7, 'YEARS', 'ARCHIVE', 'cold-storage/legal/litigation',
  'Saudi Judiciary Law; Saudi Civil Procedures Law',
  'Retain 7 years after final resolution or appeal period expires.',  TRUE),

(52, 'Global', 'CUSTOM',    7, 'YEARS', 'ARCHIVE', NULL,
  'General legal principle; GDPR (legal claims exception Art. 17(3)(e))',
  'International baseline: retain until all appeals exhausted + 7 years.', FALSE),

-- ── Regulatory Filings (cat 53) ────────────────────────────────────────────
(53, 'KSA', 'CREATION_DATE', 7, 'YEARS', 'ARCHIVE', 'cold-storage/compliance/regulatory',
  'ZATCA Regulations; SOCPA; Saudi Companies Law; SAMA Circulars',
  '7 years standard for regulatory correspondence and compliance filings.', TRUE),

-- ── System & Application Logs (cat 61) ────────────────────────────────────
(61, 'KSA', 'CREATION_DATE', 90, 'DAYS', 'DELETE', NULL,
  'NCA Essential Cybersecurity Controls (ECC-1-4-4); PDPL Art. 22',
  'NCA minimum 90 days for operational logs. Increase to 180 for critical systems.', TRUE),

(61, 'Global', 'CREATION_DATE', 90, 'DAYS', 'DELETE', NULL,
  'NIST SP 800-92; CIS Controls v8; General IT security practice',
  'Industry standard: 90 days minimum for application logs.', FALSE),

-- ── Security & Access Logs (cat 62) ────────────────────────────────────────
(62, 'KSA', 'CREATION_DATE', 1, 'YEARS', 'ARCHIVE', 'cold-storage/security/access-logs',
  'NCA Essential Cybersecurity Controls (ECC-1-4-4); PDPL Art. 22; CITC Regulations',
  'NCA ECC requires minimum 1 year for access and authentication logs.', TRUE),

(62, 'EU',  'CREATION_DATE', 1, 'YEARS', 'ARCHIVE', 'cold-storage/security/access-logs-eu',
  'GDPR Art. 32; EU NIS2 Directive; ENISA Guidelines',
  'NIS2 Directive: 1 year minimum for security-relevant access logs.', FALSE),

-- ── Security Incidents (cat 63) ────────────────────────────────────────────
(63, 'KSA', 'CREATION_DATE', 3, 'YEARS', 'ARCHIVE', 'cold-storage/security/incidents',
  'NCA ECC; PDPL Art. 22 (Breach Notification); CITC Cybersecurity Regulations',
  '3 years for security incident records to support regulatory investigations.', TRUE),

(63, 'EU',  'CREATION_DATE', 3, 'YEARS', 'ARCHIVE', 'cold-storage/security/incidents-eu',
  'GDPR Art. 33-34 (Breach Notification); EU NIS2 Directive',
  '3 years minimum post-incident: GDPR breach notifications + NIS2 requirements.', FALSE)

ON CONFLICT DO NOTHING;
