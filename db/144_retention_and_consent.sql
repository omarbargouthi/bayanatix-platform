-- Platform policy settings (one row):
--  * Retention for Bayanis's own records. NULL = keep forever (the default for
--    everything except data-quality samples, which keep the 90 days they had).
--    Purged daily by lib/privacy/retention.ts (scheduler -> /api/admin/retention/run).
--  * User consent: an acceptable-use / activity-monitoring notice shown after
--    sign-in when enabled by an administrator, per management direction. Bumping
--    consent_version asks everyone to accept again.
-- user_consents is the evidence of each decision and is never purged.

CREATE TABLE IF NOT EXISTS bayanat.platform_policy_settings (
  settings_id               integer PRIMARY KEY DEFAULT 1 CHECK (settings_id = 1),
  audit_log_days            integer CHECK (audit_log_days IS NULL OR audit_log_days >= 1),
  data_access_log_days      integer CHECK (data_access_log_days IS NULL OR data_access_log_days >= 1),
  job_log_days              integer CHECK (job_log_days IS NULL OR job_log_days >= 1),
  notification_days         integer CHECK (notification_days IS NULL OR notification_days >= 1),
  dq_sample_days            integer DEFAULT 90 CHECK (dq_sample_days IS NULL OR dq_sample_days >= 1),
  last_retention_run_at     timestamptz,
  last_retention_result     jsonb,
  consent_enabled           boolean NOT NULL DEFAULT false,
  consent_version           integer NOT NULL DEFAULT 1,
  consent_title_en          text NOT NULL DEFAULT 'Acceptable use and activity monitoring notice',
  consent_text_en           text NOT NULL DEFAULT '',
  consent_title_ar          text NOT NULL DEFAULT 'إشعار الاستخدام المقبول ومراقبة النشاط',
  consent_text_ar           text NOT NULL DEFAULT '',
  consent_updated_at        timestamptz,
  consent_updated_by        varchar(100),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id        varchar(100)
);

INSERT INTO bayanat.platform_policy_settings (settings_id, consent_text_en, consent_text_ar)
VALUES (1,
'By using Bayanis, you acknowledge and agree that:

1. The organisation records your user details (name, email address and role) and your activity in Bayanis, including sign-ins, changes to metadata, approvals, requests and every view of live data, for governance, security and audit purposes.
2. These records may be reviewed by authorised staff and used by the organisation as needed to meet its data governance, security, legal and regulatory obligations.
3. Personal data is shown in clear text only for an approved purpose and legal basis, and every such access is logged.
4. Records are kept in line with the organisation''s retention policy.

If you do not agree, select Decline. You will be signed out; please contact your administrator.',
'باستخدامك منصة بيانس، فإنك تقر وتوافق على ما يلي:

1. تسجّل الجهة بياناتك كمستخدم (الاسم والبريد الإلكتروني والدور) ونشاطك في بيانس، بما في ذلك تسجيلات الدخول وتغييرات البيانات الوصفية والموافقات والطلبات وكل عرض للبيانات الحية، لأغراض الحوكمة والأمن والتدقيق.
2. يجوز للموظفين المخولين مراجعة هذه السجلات، وتستخدمها الجهة حسب الحاجة للوفاء بالتزاماتها في حوكمة البيانات والأمن والمتطلبات النظامية والتنظيمية.
3. لا تُعرض البيانات الشخصية بنص واضح إلا لغرض معتمد وأساس نظامي، ويُسجَّل كل وصول من هذا النوع.
4. تُحفظ السجلات وفقاً لسياسة الاحتفاظ لدى الجهة.

إذا لم توافق، اختر "رفض". سيتم تسجيل خروجك؛ يرجى التواصل مع مدير النظام.')
ON CONFLICT (settings_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bayanat.user_consents (
  consent_id        bigserial PRIMARY KEY,
  user_id           varchar(100) NOT NULL,
  consent_version   integer NOT NULL,
  decision_code     varchar(10) NOT NULL CHECK (decision_code IN ('ACCEPTED', 'DECLINED')),
  decided_at        timestamptz NOT NULL DEFAULT now(),
  ip_address_text   varchar(45),
  user_agent_text   text
);
CREATE INDEX IF NOT EXISTS ix_user_consents_user ON bayanat.user_consents (user_id, consent_version);
