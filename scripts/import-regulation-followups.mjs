/**
 * Follow-ups from the regulation frameworks refresh (scripts/import-regulation-refresh.mjs):
 *
 * 1. The 5 NDI placeholder "-ALT##" requirements get real permanent req_codes
 *    (base code + a distinguishing sequence number 1-5, one per row in the
 *    order they were originally reported) and are imported into NDI_2026.
 * 2. CST (19 requirements, English-only since its original import) gets a
 *    full Arabic translation, registered as AI_TRANSLATED (English is the
 *    genuine CITC-official base text; Arabic is the new AI output — same
 *    direction as BCBS239).
 * 3. The 20 "NDI Ops Exc" rows become a new framework, NDI_OPS_EXCELLENCE,
 *    extending NDI conceptually (reuses NDI's own domain names) but as its
 *    own framework since its req_code namespace never overlapped NDI's.
 *
 * All three reuse the same upsert-by-code / register-translation patterns as
 * the main import script — safe to rerun.
 *
 * Run: node scripts/import-regulation-followups.mjs
 */
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:test_password@localhost:5431/bayanatix");
const trim = (v) => (v == null ? null : String(v).trim() || null);

// ── Shared helpers (mirrors import-regulation-refresh.mjs) ─────────────────

async function upsertFramework({ name, code, description, groupCode, assessmentMode }) {
  const [fw] = await sql`
    INSERT INTO bayanat.gov_compliance_frameworks (name, code, version, description, regulation_group_code, is_applicable_indicator, assessment_mode)
    VALUES (${name}, ${code}, '1.0', ${description}, ${groupCode}, true, ${assessmentMode})
    ON CONFLICT (code) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      regulation_group_code = EXCLUDED.regulation_group_code, assessment_mode = EXCLUDED.assessment_mode
    RETURNING framework_id
  `;
  return fw.framework_id;
}

async function seedComplianceOnlyLevel(fwId) {
  await sql`
    INSERT INTO bayanat.gov_compliance_level_config (framework_id, level_num, name, color_hex, description, name_ar)
    VALUES (${fwId}, 0, 'Requirement', '#2D4AA0', 'Every requirement in this framework — assessed individually, not against a maturity scale.', 'متطلب')
    ON CONFLICT (framework_id, level_num) DO UPDATE SET name_ar = EXCLUDED.name_ar
  `;
}

const STATUS_COMPLIANCE_ONLY = [
  { code: "COMPLIANCE", label: "Compliance", labelAr: "امتثال", color: "#10B981", sort: 1 },
  { code: "PARTIAL_COMPLIANCE", label: "Partial Compliance", labelAr: "امتثال جزئي", color: "#F59E0B", sort: 2 },
  { code: "NON_COMPLIANCE", label: "Non Compliance", labelAr: "عدم الامتثال", color: "#EF4444", sort: 3 },
  { code: "NA", label: "N/A", labelAr: "لا ينطبق", color: "#6B7280", sort: 4 },
];
async function seedStatusConfig(fwId) {
  for (const s of STATUS_COMPLIANCE_ONLY) {
    await sql`
      INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
      VALUES (${fwId}, 'STATUS', ${s.code}, ${s.label}, ${s.labelAr}, ${s.color}, ${s.sort})
      ON CONFLICT (framework_id, config_group, code) DO UPDATE SET label = EXCLUDED.label, label_ar = EXCLUDED.label_ar, color_hex = EXCLUDED.color_hex
    `;
  }
  await sql`
    INSERT INTO bayanat.compliance_config_items (framework_id, config_group, code, label, label_ar, color_hex, sort_order)
    VALUES (${fwId}, 'COMPLIANCE_TYPE', 'امتثال', 'Compliance', 'امتثال', '#2D4AA0', 1)
    ON CONFLICT (framework_id, config_group, code) DO NOTHING
  `;
}

async function upsertDomainConfig(fwId, domainCode, nameEn, nameAr, sortOrder) {
  if (!domainCode) return;
  await sql`
    INSERT INTO bayanat.gov_compliance_domain_config (framework_id, domain_code, name_en, name_ar, sort_order)
    VALUES (${fwId}, ${domainCode}, ${nameEn}, ${nameAr}, ${sortOrder})
    ON CONFLICT (framework_id, domain_code) DO UPDATE SET name_en = EXCLUDED.name_en, name_ar = EXCLUDED.name_ar
  `;
}

async function upsertRequirement(fwId, r) {
  const questionEn = trim(r.questionEn);
  if (!questionEn) return null;
  const [row] = await sql`
    INSERT INTO bayanat.gov_compliance_requirements
      (framework_id, req_code, standard, standard_code, standard_ar, req_text, domain, domain_code, domain_en,
       maturity_level, compliance_or_maturity, sort_order,
       question_en, admission_criteria_en, admission_criteria, supporting_evidence_en, supporting_evidence)
    VALUES (
      ${fwId}, ${r.reqCode}, ${trim(r.standardEn)}, ${trim(r.standardEn)}, ${trim(r.standardAr)},
      ${trim(r.requirementAr) || questionEn}, ${trim(r.domainAr) || trim(r.domainEn)}, ${trim(r.domainEn)}, ${trim(r.domainEn)},
      ${r.maturityLevel ?? "0"}, ${r.complianceOrMaturity ?? "امتثال"}, ${r.sortOrder},
      ${questionEn}, ${trim(r.admissionCriteriaEn)}, ${trim(r.admissionCriteriaAr)},
      ${trim(r.supportingEvidenceEn) ?? null}, ${trim(r.supportingEvidenceAr) ?? null}
    )
    ON CONFLICT (framework_id, req_code) DO UPDATE SET
      standard = EXCLUDED.standard, standard_code = EXCLUDED.standard_code, standard_ar = EXCLUDED.standard_ar,
      req_text = EXCLUDED.req_text, domain = EXCLUDED.domain, domain_code = EXCLUDED.domain_code, domain_en = EXCLUDED.domain_en,
      maturity_level = EXCLUDED.maturity_level, sort_order = EXCLUDED.sort_order,
      question_en = EXCLUDED.question_en, admission_criteria_en = EXCLUDED.admission_criteria_en, admission_criteria = EXCLUDED.admission_criteria,
      supporting_evidence_en = EXCLUDED.supporting_evidence_en, supporting_evidence = EXCLUDED.supporting_evidence
    RETURNING req_id
  `;
  return row.req_id;
}

async function upsertTranslationKey(categoryCode, keyCode, baseText, secondaryLang, rawSecondary, contextNote) {
  if (!baseText) return null;
  const [existing] = await sql`SELECT key_id AS "keyId", base_text AS "baseText" FROM bayanat.translation_keys WHERE key_code = ${keyCode}`;
  let keyId;
  if (!existing) {
    const [inserted] = await sql`
      INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code, context_note_text)
      VALUES (${categoryCode}, ${keyCode}, ${baseText}, 'en', ${contextNote ?? null})
      RETURNING key_id AS "keyId"
    `;
    keyId = inserted.keyId;
  } else {
    keyId = existing.keyId;
    if (existing.baseText !== baseText) {
      await sql`UPDATE bayanat.translation_keys SET base_text = ${baseText}, context_note_text = ${contextNote ?? null} WHERE key_id = ${keyId}`;
      await sql`UPDATE bayanat.translations SET status_code = 'STALE' WHERE key_id = ${keyId} AND status_code <> 'MISSING'`;
    } else if (contextNote) {
      await sql`UPDATE bayanat.translation_keys SET context_note_text = ${contextNote} WHERE key_id = ${keyId}`;
    }
  }
  const secondary = rawSecondary && String(rawSecondary).trim() && String(rawSecondary).trim() !== baseText ? String(rawSecondary).trim() : null;
  if (secondary) {
    await sql`
      INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
      VALUES (${keyId}, ${secondaryLang}, ${secondary}, 'VERIFIED', now(), now())
      ON CONFLICT (key_id, language_code) DO NOTHING
    `;
  }
  return keyId;
}

async function registerRequirementTranslations(reqId, r, contextNote) {
  const keyIds = [];
  const fields = [
    ["question", r.questionEn, r.requirementAr],
    ["admission_criteria", r.admissionCriteriaEn, r.admissionCriteriaAr],
    ["supporting_evidence", r.supportingEvidenceEn, r.supportingEvidenceAr],
    ["standard", r.standardEn, r.standardAr],
  ];
  for (const [suffix, en, ar] of fields) {
    const baseText = trim(en);
    if (!baseText) continue;
    const keyId = await upsertTranslationKey("COMPLIANCE_REQUIREMENTS", `compliance.req.${reqId}.${suffix}`, baseText, "ar", ar, contextNote);
    if (keyId) keyIds.push(keyId);
  }
  return keyIds;
}

// ── 1. NDI -ALT## rows → real permanent req_codes ───────────────────────────
// Mapping (base req_code + distinguishing sequence 1-5, in the order these
// were originally reported as a second, distinct evidence item sharing a
// spec code with an existing NDI requirement):
//   DSI.C.5.1.1-ALT17  -> DSI.C.5.1.1-1
//   DSI.C.7.1.2-ALT20  -> DSI.C.7.1.2-2
//   DSI.M.12-ALT23     -> DSI.M.12-3
//   DG.C.1.4-ALT88     -> DG.C.1.4-4
//   DG.M.13-ALT124     -> DG.M.13-5

const NDI_ALT_ROWS = [
  {
    reqCode: "DSI.C.5.1.1-1", domainEn: "Data Sharing and Integration Domain (DSI)", domainAr: "مجال تكامل البيانات ومشاركتها",
    standardEn: "DSI.MQ.2", standardAr: "DSI.MQ.2", maturityLevel: "2",
    questionEn: "Has the entity defined and implemented data sharing processes both internally and with other entities?",
    requirementAr: "هل عرفت الجهة ونفذت عمليات مشاركة البيانات داخل الجهة ومع الجهات الأخرى؟",
    admissionCriteriaEn: "The entity must attach documentation of the data sharing process with process details, including at minimum the following:\n- Receiving the data sharing request.\n- Identifying/assigning functional roles.\n- Checking/verifying the data classification level.\n- Evaluating data sharing principles.\n- Data sharing decision and response to the request (feedback).\n- Approval/endorsement by the Business Data Executive.\n- Designing and implementing data sharing controls.\n- Signing the data sharing agreement.\n- Sharing the data with the requester.",
    admissionCriteriaAr: "يجب على الجهة أن ترفق وثائق عملية مشاركة البيانات مع تفاصيل العملية، والتي \r\nتشمل كحد أدنى على ما يلي:\r\n استقبال / استلام طلب مشاركة البيانات.\r\n تحديد / تخصيص الأدوار الوظيفية.\r\n فحص / تحقق من مستوى تصنيف البيانات.\r\n تقييم مباد مشاركة البيانات.\r\n قرار مشاركة البيانات والرد على الطلب )Feedback).\r\n موافقة / اعتماد ممثل بيانات الأعمال (Executive Data Business(.\r\n تصميم وتنفيذ ضوابط مشاركة البيانات.\r\n توقيع اتفاقية مشاركة البيانات.\r\n مشاركة البيانات مع مقدم الطلب",
    supportingEvidenceEn: "- Data sharing process document (including data classification levels and timelines).",
    supportingEvidenceAr: "• وثيقة عملية مشاركة البيانات (بما في ذلك مستويات تصنيف البيانات والجداول الزمنية).",
  },
  {
    reqCode: "DSI.C.7.1.2-2", domainEn: "Data Sharing and Integration Domain (DSI)", domainAr: "مجال تكامل البيانات ومشاركتها",
    standardEn: "DSI.MQ.2", standardAr: "DSI.MQ.2", maturityLevel: "2",
    questionEn: "Has the entity defined and implemented data sharing processes both internally and with other entities?",
    requirementAr: "هل عرفت الجهة ونفذت عمليات مشاركة البيانات داخل الجهة ومع الجهات الأخرى؟",
    admissionCriteriaEn: "The entity must attach external data sharing agreements with other entities, including at minimum the following:\n- Purpose of the data sharing.\n- Information on each requesting and providing entity (whose data will be shared).\n- Legal basis for the sharing.\n- Sharing details (date, duration, etc.).\n- Liability provisions.\n- Data sharing agreements signed by the Business Data Executive and the data requester.",
    admissionCriteriaAr: "يجب على الجهة أن ترفق اتفاقيات مشاركة البيانات خارجيا مع جهات أخرى على أن \r\nتشمل كحد أدنى على ما يلي:\r\n غر مشاركة البيانات.\r\n معلومات عن كل جهة طالبة ومانحة )ستقوم بمشاركة بياناتها(.\r\n أساس قانوني للمشاركة.\r\n تفاصيل المشاركة )التاريخ، المدة، إلخ.(.\r\n أحكام المسؤولية.\r\n اتفاقيات مشاركة البيانات الموقعة من جانب ممثل بيانات الأعمال ) Business\r\nExecutive Data )وطالب البيانات.",
    supportingEvidenceEn: "- The developed and approved template for the external data sharing agreement.",
    supportingEvidenceAr: "• نموذج القالب (Template) المُطوَّر والمعتمد لاتفاقية مشاركة البيانات خارجيًّا.",
  },
  {
    reqCode: "DSI.M.12-3", domainEn: "Data Sharing and Integration Domain (DSI)", domainAr: "مجال تكامل البيانات ومشاركتها",
    standardEn: "DSI.MQ.2", standardAr: "DSI.MQ.2", maturityLevel: "3",
    questionEn: "Has the entity defined and implemented data sharing processes both internally and with other entities?",
    requirementAr: "هل عرفت الجهة ونفذت عمليات مشاركة البيانات داخل الجهة ومع الجهات الأخرى؟",
    admissionCriteriaEn: "The entity must attach a document detailing the permission and usage controls for accessing the request-receiving channel on its official government website.",
    admissionCriteriaAr: "يجب على الجهة أن ترفق وثيقة تفصل ضوابط الصالحيات والاستخدام للوصول إلى \r\nقناة تلقي الطلبات على موقعها الإلكتروني الحكومي الرسمي.",
    supportingEvidenceEn: "- Document on access-permission controls.",
    supportingEvidenceAr: "- وثيقة ضوابط إتاحة صلاحيات الوصول (Access).",
  },
  {
    reqCode: "DG.C.1.4-4", domainEn: "Data Governance Domain", domainAr: "حوكمة البيانات",
    standardEn: "DG.MQ.1", standardAr: "DG.MQ.1", maturityLevel: "2",
    questionEn: "Has the entity built and implemented a strategy for data management and personal data protection, along with a plan for managing data and protecting personal data, with key performance indicators (KPIs) that can be continuously measured to ensure improvement?",
    requirementAr: "هل قامت الجهة ببناء وتنفيذ استراتيجية لإدارة البيانات وحماية البيانات الشخصية وخطة لإدارة البيانات وحماية البيانات الشخصية، مع وضع مؤشرات أداء رئيسية (KPIs) يمكن قياسها باستمرار لضمان التحسين؟",
    admissionCriteriaEn: "Attach a copy of the decision approving the entity's data strategy issued by the data management committee or the entity's top official.",
    admissionCriteriaAr: "إرفاق صورة من قرار اعتماد استراتيجية البيانات الخاصة بالجهة من قبل لجنة إدارة البيانات\r\nأو المسؤول الأول في الجهة.",
    supportingEvidenceEn: "3) Decision approving the data strategy.",
    supportingEvidenceAr: "3) قرار اعتماد استراتيجية البيانات.",
  },
  {
    reqCode: "DG.M.13-5", domainEn: "Data Governance Domain", domainAr: "حوكمة البيانات",
    standardEn: "DG.MQ.4", standardAr: "DG.MQ.4", maturityLevel: "2",
    questionEn: "Has the organization implemented change management practices, including raising awareness, communication, managing the change process, and building/developing capabilities?",
    requirementAr: "هل قامت الجهة بوضع وتنفيذ ممارسات إدارة التغيير بما يشمل رفع مستوى الوعي، والتواصل، وضبط عملية التغيير وبناء/تطوير القدرات؟",
    admissionCriteriaEn: "b) Communication plan regarding data management.",
    admissionCriteriaAr: "ب- خطة التواصل بخصوص إدارة البيانات.",
    supportingEvidenceEn: "b) Communication plan regarding data management.",
    supportingEvidenceAr: "ب- خطة التواصل بخصوص إدارة البيانات.",
  },
];

const NDI_ALT_CONTEXT_NOTE =
  "Newly-assigned permanent req_code (was a temporary placeholder — a duplicate spec code in the source describing a second evidence item). Confirm this is intentional, not a duplicate entry error.";

async function importNdiAltRows() {
  const [ndi] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_2026'`;
  let sortOrder = 900; // past the existing 518 rows' sort range
  for (const r of NDI_ALT_ROWS) {
    const reqId = await upsertRequirement(ndi.id, { ...r, complianceOrMaturity: "نضج", sortOrder: sortOrder++ });
    if (!reqId) continue;
    await registerRequirementTranslations(reqId, r, NDI_ALT_CONTEXT_NOTE);
    console.log(`  [NDI_2026] +${r.reqCode} (req_id=${reqId})`);
  }
}

// ── 2. CST arabization ───────────────────────────────────────────────────

const CST_DOMAIN_TRANSLATIONS = {
  "CST - General Principles for Personal Data Protection": "هيئة الاتصالات والفضاء والتقنية - المبادئ العامة لحماية البيانات الشخصية",
  " Procedures To Launch Services Or Products Based On Customers\\Personal Data Or Personal Data Sharing":
    "إجراءات إطلاق الخدمات أو المنتجات القائمة على البيانات الشخصية للعملاء أو مشاركة البيانات الشخصية",
};
const CST_STANDARD_TRANSLATIONS = {
  "Section 3: General Provisions": "القسم 3: أحكام عامة",
  "Section 4: Main Principles to Protect Customers‘ Personal Data": "القسم 4: المبادئ الرئيسية لحماية البيانات الشخصية للعملاء",
  "Section 5: Service Providers Obligations": "القسم 5: التزامات مقدمي الخدمة",
  "Section 6: Customers' Rights Regarding Their Personal Data Protection": "القسم 6: حقوق العملاء المتعلقة بحماية بياناتهم الشخصية",
  "Section 4": "القسم 4",
};
const CST_REQUIREMENT_AR = {
  "CST-1": "3.2 يجب على مقدم الخدمة التحقق بشكل دوري من التزام أي طرف ثالث متعاقد معه لمعالجة البيانات الشخصية للأغراض التي يحددها مقدم الخدمة بهذه المبادئ، ويجب على مقدم الخدمة تقديم الأدلة التي تثبت التزامهم بهذه المبادئ من خلال الآليات التي تعتمدها هيئة الاتصالات والفضاء والتقنية (CITC).",
  "CST-2": "4.2 يجب معالجة البيانات الشخصية للعملاء لأغراض محددة وواضحة للعميل.",
  "CST-3": "4.3 يجب أن يتم جمع البيانات الشخصية للعملاء بشكل كافٍ ومقتصر على ما هو ضروري، بما يتناسب مع الأغراض التي تُعالج من أجلها.",
  "CST-4": "4.4 لا يجوز الاحتفاظ بالبيانات الشخصية للعملاء بصيغة تسمح بالتعرف على هوية العميل لمدة أطول مما هو ضروري لتحقيق أغراض معالجة البيانات الشخصية.",
  "CST-5": "4.5 يجب حماية البيانات الشخصية للعملاء بشكل آمن لضمان خصوصيتها ومنع الوصول غير المصرح به إليها أو اختراقها أو العبث بها أو إساءة استخدامها.",
  "CST-6": "5.1 يجب على مقدم الخدمة تطوير وتنفيذ برنامج للخصوصية للحفاظ على حماية البيانات الشخصية للعملاء، بحيث يشمل ذلك تطوير وتوثيق وتنفيذ وإنفاذ السياسات والإجراءات الخاصة بالحفاظ على خصوصية البيانات الشخصية للعملاء. ويجب أن يُعتمد هذا البرنامج من قبل رئيس مقدم الخدمة أو من ينيبه. بالإضافة إلى ذلك، يلتزم مقدم الخدمة بتقديم خطة البرنامج إلى هيئة الاتصالات والفضاء والتقنية (CITC) قبل اعتمادها، ويجب عليه رفع تقارير دورية عن أنشطة البرنامج إلى الهيئة بعد اعتمادها. وبناءً على ذلك، يحق للهيئة طلب أي تعديلات تراها مناسبة.",
  "CST-7": "5.2 يجب على مقدم الخدمة إسناد دور ومسؤوليات حماية البيانات الشخصية للعملاء إلى وظيفة مستقلة تُنشأ لهذا الغرض، وتقديم الدعم المناسب لهذه الوظيفة لتمكينها من القيام بأنشطتها، دون الإخلال بتضارب المصالح.",
  "CST-8": "5.3 يلتزم مقدم الخدمة بتطوير واعتماد ونشر سياسة خصوصية البيانات الشخصية، على أن تشمل أنواع البيانات الشخصية للعملاء التي تتم معالجتها، والغرض من هذه المعالجة، وما إذا كانت هذه البيانات الشخصية ستتم مشاركتها مع أطراف ثالثة داخل المملكة العربية السعودية أو خارجها، ومدد الاحتفاظ بها، وتدابير الحماية، وحقوق العملاء المتعلقة ببياناتهم الشخصية وكيفية ممارسة هذه الحقوق.",
  "CST-9": "5.4 يلتزم مقدم الخدمة بمعالجة البيانات الشخصية للعملاء داخل المملكة العربية السعودية، ولا يجوز له معالجة هذه البيانات الشخصية خارج المملكة دون الحصول على موافقة خطية من هيئة الاتصالات والفضاء والتقنية (CITC).",
  "CST-10": "5.5 يلتزم مقدم الخدمة بالاحتفاظ بالبيانات الشخصية للعملاء للأغراض والمدد المحددة، ووفقًا للتعليمات المعتمدة من هيئة الاتصالات والفضاء والتقنية (CITC).",
  "CST-11": "5.6 يجب على مقدم الخدمة إخطار هيئة الاتصالات والفضاء والتقنية (CITC) فورًا عند حدوث أي اختراق للبيانات الشخصية للعملاء، من خلال الآليات والإجراءات التي تعتمدها الهيئة.",
  "CST-12": "6.1 يُحظر معالجة البيانات الشخصية للعملاء دون موافقتهم الصريحة، ويجوز للعملاء سحب موافقتهم في أي وقت، باستثناء الحالات التي تقتضيها الأنظمة واللوائح والتعليمات ذات العلاقة.",
  "CST-13": "6.2 يجب تزويد العملاء بسياسة الخصوصية قبل معالجة بياناتهم الشخصية.",
  "CST-14": "6.3 يجب تمكين العملاء من الوصول إلى بياناتهم الشخصية التي تتم معالجتها من قبل مقدم الخدمة في أي وقت، وتصحيحها في حال وجود بيانات غير صحيحة أو غير دقيقة.",
  "CST-15": "6.4 يجب تمكين العملاء من الحصول على نسخة من بياناتهم الشخصية بصيغة إلكترونية، وفقًا لتعليمات هيئة الاتصالات والفضاء والتقنية (CITC).",
  "CST-16": "يجب على مقدم الخدمة اتباع الإجراءات التالية قبل إطلاق الخدمات أو المنتجات القائمة على البيانات الشخصية للعملاء أو مشاركة البيانات الشخصية:\r\n\r\n4.1 يجب على مقدم الخدمة التحقق من مدى الحاجة إلى إجراء \"تقييم أثر الخصوصية\"، وتوثيق نتائج هذا التحقق.",
  "CST-17": "4.2 إذا أظهرت نتائج التحقق في الإجراء (4.1) عدم الحاجة إلى \"تقييم أثر الخصوصية\"، يجب على مقدم الخدمة تقديم نتائج التحقق إلى هيئة الاتصالات والفضاء والتقنية (CITC) مع بيان مبررات عدم الحاجة إلى \"تقييم أثر الخصوصية\"، وذلك قبل خمسة (5) أيام عمل من إطلاق الخدمات أو المنتجات القائمة على البيانات الشخصية للعملاء أو مشاركة البيانات الشخصية.",
  "CST-18": "4.3 إذا أظهرت نتائج التحقق في الإجراء (4.1) الحاجة إلى \"تقييم أثر الخصوصية\"، يجب على مقدم الخدمة إجراء \"تقييم أثر الخصوصية\" وتقديمه إلى هيئة الاتصالات والفضاء والتقنية (CITC)، وذلك قبل واحد وعشرين (21) يوم عمل من إطلاق الخدمات أو المنتجات القائمة على البيانات الشخصية للعملاء أو مشاركة البيانات الشخصية.",
  "CST-19": "4.6 يجب على مقدم الخدمة إخطار هيئة الاتصالات والفضاء والتقنية (CITC) عند إطلاق الخدمات أو المنتجات القائمة على البيانات الشخصية للعملاء أو مشاركة البيانات الشخصية.",
};

async function arabizeCst() {
  const [cst] = await sql`SELECT framework_id AS id FROM bayanat.gov_compliance_frameworks WHERE code = 'CST'`;
  const reqs = await sql`
    SELECT req_id, req_code, domain, standard, question_en FROM bayanat.gov_compliance_requirements WHERE framework_id = ${cst.id}
  `;
  const seenDomains = new Map();
  const seededKeyIds = [];
  for (const r of reqs) {
    const requirementAr = CST_REQUIREMENT_AR[r.req_code];
    if (!requirementAr) { console.log(`  [CST] no translation prepared for ${r.req_code}, skipping`); continue; }
    const domainAr = CST_DOMAIN_TRANSLATIONS[r.domain] ?? null;
    const standardAr = CST_STANDARD_TRANSLATIONS[r.standard] ?? null;

    await sql`UPDATE bayanat.gov_compliance_requirements SET req_text = ${requirementAr}, standard_ar = ${standardAr} WHERE req_id = ${r.req_id}`;

    const keyIds = await registerRequirementTranslations(r.req_id, {
      questionEn: r.question_en, requirementAr,
      standardEn: r.standard, standardAr,
    }, null);
    seededKeyIds.push(...keyIds);

    if (r.domain && !seenDomains.has(r.domain)) seenDomains.set(r.domain, domainAr);
  }
  for (const [domainEn, domainAr] of seenDomains) {
    const domainCode = domainEn.trim();
    await upsertDomainConfig(cst.id, domainCode, domainCode, domainAr, 0);
    await upsertTranslationKey("LIST_COMPLIANCE_DOMAINS", `list.compliance_domains.${cst.id}.${domainCode}.name`, domainCode, "ar", domainAr, null);
  }

  // English here is the genuine CITC-official base text; Arabic is the new AI
  // output — same direction as BCBS239, so flag it AI_TRANSLATED, not VERIFIED.
  if (seededKeyIds.length) {
    await sql`UPDATE bayanat.translations SET status_code = 'AI_TRANSLATED' WHERE key_id = ANY(${seededKeyIds}) AND language_code = 'ar' AND status_code = 'VERIFIED'`;
  }
  console.log(`  [CST] arabized ${reqs.length} requirements, ${seenDomains.size} domains, ${seededKeyIds.length} translation keys flagged AI_TRANSLATED`);
}

// ── 3. NDI Ops Excellence — new framework ───────────────────────────────────

const NDI_DOMAIN_EN = {
  DSI: "Data Sharing and Integration Domain (DSI)",
  DQ: "Data Quality Domain",
  RMD: "Reference and Master Data Domain (RMD)",
  DO: "Data Operations Domain",
  MCM: "Metadata and Data Catalog Management Domain (MCM)",
  OD: "Open Data Domain",
};
const NDI_DOMAIN_AR = {
  DSI: "مجال تكامل البيانات ومشاركتها",
  DQ: "جودة البيانات",
  RMD: "مجال إدارة البيانات المرجعية والرئيسية (RMD)",
  DO: "تشغيل البيانات",
  MCM: "مجال إدارة البيانات الوصفية ودليل / فهرس البيانات",
  OD: "البيانات المفتوحة",
};

const OPS_EXC_ROWS = [
  { code: "DSI.OE.1", domain: "DSI", platformEn: "Government Service Bus (GSB), National Data Catalog (NDC)", platformAr: "قناة التكامل الحكومية GSB، فهرس البيانات الوطني NDC", en: "Data fields that the entity shares on the Government Service Bus (GSB) without being the source of them.", ar: "حقـول البيانات التي تقـوم الجهـة بمشـاركتها علـى قنـاة التكامـل الحكوميـة، دون أن تكون المصدر لها.", req2: false },
  { code: "DSI.OE.2", domain: "DSI", platformEn: "National Data Lake (NDL)", platformAr: "بحيرة البيانات الوطنية NDL", en: "The entity's systems that have been connected to the National Data Lake (NDL).", ar: "أنظمة الجهة التي تم ربطها ببحيرة البيانات الوطنية.", req2: true },
  { code: "DSI.OE.3", domain: "DSI", platformEn: "Data Marketplace Platform (DMP)", platformAr: "منصة سوق البيانات DMP", en: "The time taken by the entity to process data sharing agreements.", ar: "المدة المستغرقة لمعالجة الجهة لاتفاقيات مشاركة البيانات.", req2: false },
  { code: "DQ.OE.1", domain: "DQ", platformEn: "Government Service Bus (GSB)", platformAr: "قناة التكامل الحكومية GSB", en: "The quality of the entity's data shared on the Government Service Bus (GSB).", ar: "جودة بيانات الجهة المشاركة في قناة التكامل الحكومية.", req2: false },
  { code: "DQ.OE.2", domain: "DQ", platformEn: "National Data Lake (NDL)", platformAr: "بحيرة البيانات الوطنية NDL", en: "The quality of the entity's data hosted in the National Data Lake (NDL).", ar: "جودة بيانات الجهة المستضافة في بحيرة البيانات الوطنية.", req2: true },
  { code: "RMD.OE.1", domain: "RMD", platformEn: "Reference Data Platform (RDP)", platformAr: "نظام إدارة البيانات المرجعية RDP", en: "Reference data tables published by the entity.", ar: "جداول البيانات المرجعية التي تم نشرها من قبل الجهة.", req2: true },
  { code: "RMD.OE.2", domain: "RMD", platformEn: "Reference Data Platform (RDP)", platformAr: "نظام إدارة البيانات المرجعية RDP", en: "The time taken to publish new reference data tables.", ar: "المدة المستغرقة لنشر جداول بيانات مرجعية جديدة.", req2: false },
  { code: "RMD.OE.3", domain: "RMD", platformEn: "Reference Data Platform (RDP)", platformAr: "نظام إدارة البيانات المرجعية RDP", en: "The time taken to resolve issues reported in reference data tables.", ar: "المدة المستغرقة لإيصال المشاكل المبلغ عنها في جداول البيانات المرجعية.", req2: false },
  { code: "DO.OE.1", domain: "DO", platformEn: "Government Service Bus (GSB)", platformAr: "قناة التكامل الحكومية GSB", en: "The response time of the entity's services published on the Government Service Bus (GSB).", ar: "المدة المستغرقة لاستجابة خدمات الجهة المنشورة على قناة التكامل الحكومية.", req2: false },
  { code: "DO.OE.2", domain: "DO", platformEn: "Government Service Bus (GSB)", platformAr: "قناة التكامل الحكومية GSB", en: "The responsiveness of services on the Government Service Bus (GSB).", ar: "استجابة الخدمات على قناة التكامل الحكومية.", req2: true },
  { code: "DO.OE.3", domain: "DO", platformEn: "National Data Lake (NDL)", platformAr: "بحيرة البيانات الوطنية NDL", en: "The responsiveness of automated integration solutions with the National Data Lake (NDL).", ar: "استجابة حلول الربط الآلي ببحيرة البيانات الوطنية.", req2: true },
  { code: "MCM.OE.1", domain: "MCM", platformEn: "National Data Catalog (NDC)", platformAr: "فهرس البيانات الوطني NDC", en: "The entity's systems catalogued in the National Data Catalog (NDC).", ar: "أنظمة الجهة المفهرسة في فهرس البيانات الوطني.", req2: true },
  { code: "MCM.OE.2", domain: "MCM", platformEn: "National Data Catalog (NDC)", platformAr: "فهرس البيانات الوطني NDC", en: "Business fields defined in the National Data Catalog (NDC).", ar: "حقول الأعمال المعرفة في فهرس البيانات الوطني.", req2: true },
  { code: "MCM.OE.3", domain: "MCM", platformEn: "National Data Catalog (NDC)", platformAr: "فهرس البيانات الوطني NDC", en: "Performance indicators and standards defined in the National Data Catalog (NDC).", ar: "مؤشرات الأداء والمعايير المعرفة في فهرس البيانات الوطني.", req2: true },
  { code: "MCM.OE.4", domain: "MCM", platformEn: "National Data Catalog (NDC)", platformAr: "فهرس البيانات الوطني NDC", en: "Field standards defined in the National Data Catalog (NDC).", ar: "معايير الحقول المعرفة في فهرس البيانات الوطني.", req2: false },
  { code: "MCM.OE.5", domain: "MCM", platformEn: "National Data Catalog (NDC)", platformAr: "فهرس البيانات الوطني NDC", en: "The accuracy of relationships between data fields in the National Data Catalog (NDC).", ar: "دقة العلاقات بين حقول البيانات في فهرس البيانات الوطني.", req2: false },
  { code: "OD.OE.1", domain: "OD", platformEn: "Open Data Portal (ODP)", platformAr: "بوابة البيانات المفتوحة ODP", en: "The delay in updating open data sets.", ar: "مدة التأخر في تحديث مجموعات البيانات المفتوحة.", req2: false },
  { code: "OD.OE.2", domain: "OD", platformEn: "Open Data Portal (ODP)", platformAr: "بوابة البيانات المفتوحة ODP", en: "Data sets published on the Open Data Portal (ODP).", ar: "مجموعات البيانات المنشورة في بوابة البيانات المفتوحة.", req2: true },
  { code: "OD.OE.3", domain: "OD", platformEn: "Open Data Portal (ODP)", platformAr: "بوابة البيانات المفتوحة ODP", en: "The number of issues reported in open data sets.", ar: "عدد المشاكل المبلغ عنها في مجموعات البيانات المفتوحة.", req2: false },
  { code: "OD.OE.4", domain: "OD", platformEn: "Open Data Portal (ODP)", platformAr: "بوابة البيانات المفتوحة ODP", en: "The delay in resolving issues reported in open data sets.", ar: "مدة التأخر في حل المشاكل المبلغ عنها في مجموعات البيانات المفتوحة.", req2: false },
];

async function importNdiOpsExcellence() {
  const fwId = await upsertFramework({
    name: "NDI Operational Excellence", code: "NDI_OPS_EXCELLENCE",
    description: "Platform-linked operational excellence indicators extending the National Data Index (NDI) — service quality/responsiveness metrics tracked separately from the standard maturity assessment.",
    groupCode: "KSA_REGULATIONS", assessmentMode: "COMPLIANCE_ONLY",
  });
  await seedComplianceOnlyLevel(fwId);
  await seedStatusConfig(fwId);

  const seenDomains = new Map();
  let sortOrder = 0;
  for (const row of OPS_EXC_ROWS) {
    const domainEn = NDI_DOMAIN_EN[row.domain];
    const domainAr = NDI_DOMAIN_AR[row.domain];
    const admissionCriteriaEn = `Required in the 2nd measurement cycle: ${row.req2 ? "Yes" : "No"}.`;
    const admissionCriteriaAr = `متطلب في دورة القياس الثانية: ${row.req2 ? "نعم" : "لا"}.`;

    const reqId = await upsertRequirement(fwId, {
      reqCode: row.code, domainEn, domainAr, standardEn: row.platformEn, standardAr: row.platformAr,
      questionEn: row.en, requirementAr: row.ar,
      admissionCriteriaEn, admissionCriteriaAr,
      sortOrder: sortOrder++,
    });
    if (!reqId) continue;
    await registerRequirementTranslations(reqId, {
      questionEn: row.en, requirementAr: row.ar, standardEn: row.platformEn, standardAr: row.platformAr,
      admissionCriteriaEn, admissionCriteriaAr,
    }, null);
    if (!seenDomains.has(row.domain)) seenDomains.set(row.domain, { domainEn, domainAr, sortOrder: seenDomains.size });
  }
  for (const [code, { domainEn, domainAr, sortOrder: dSort }] of seenDomains) {
    await upsertDomainConfig(fwId, domainEn, domainEn, domainAr, dSort);
    await upsertTranslationKey("LIST_COMPLIANCE_DOMAINS", `list.compliance_domains.${fwId}.${domainEn}.name`, domainEn, "ar", domainAr, null);
  }
  console.log(`  [NDI_OPS_EXCELLENCE] upserted ${OPS_EXC_ROWS.length} requirements, ${seenDomains.size} domains (fwId=${fwId})`);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("Regulation follow-ups: NDI -ALT codes, CST arabization, NDI Ops Excellence\n");

  console.log("1. Importing 5 NDI requirements with real permanent req_codes...");
  await importNdiAltRows();

  console.log("\n2. Arabizing CST (19 requirements)...");
  await arabizeCst();

  console.log("\n3. Importing NDI Ops Excellence as a new framework...");
  await importNdiOpsExcellence();

  console.log("\n--- Summary ---");
  const counts = await sql`
    SELECT f.code, count(r.req_id)::int AS n FROM bayanat.gov_compliance_frameworks f
    LEFT JOIN bayanat.gov_compliance_requirements r ON r.framework_id = f.framework_id
    GROUP BY f.code ORDER BY f.code
  `;
  for (const c of counts) console.log(`  ${c.code}: ${c.n} requirements`);

  await sql.end();
}

main().catch(async (err) => {
  console.error(err);
  await sql.end();
  process.exit(1);
});
