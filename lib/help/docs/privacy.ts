import type { HelpDoc } from "../types";

export const PRIVACY_DOCS: HelpDoc[] = [
  {
    slug: "data-retention",
    group: "privacy",
    title: "Data retention and legal holds",
    summary: "How long each kind of data is kept, which tables hold it, and legal holds that stop deletion.",
    page: "/privacy",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Data Privacy › Data Retention has three tabs:
- **Overview:** the retention position across all categories.
- **Categories:** **data categories** (for example Customer records, Employee records) with their retention schedule, the tables that hold them, the key column that identifies a record, and whether deletion cascades to related tables.
- **Legal Holds:** holds placed for a case or investigation. A hold can cover whole tables or only the records that meet conditions (for example "customer_id = 1042" or "created before 2020"). Held data must not be deleted.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Data is kept as long as the law and the business require, and no longer, as privacy laws ask.
- Legal holds protect evidence.
- A downloadable **retention manifest** gives the team or tool that purges data everything it needs: schedules, table locations, related tables and the active hold conditions. Bayanis itself never deletes or changes data in your systems.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Create categories and set their retention period.
2. Associate the tables that hold each category, with the key column and the cascade choice.
3. Place legal holds when needed, with their case reference and conditions; release them when the case ends.
4. Download the manifest for one category or for all.

Access: administrators and compliance officers.`,
      },
    ],
    related: ["data-subject-requests", "impact-assessments", "classification"],
  },
  {
    slug: "data-subject-requests",
    group: "privacy",
    title: "Data subject requests",
    summary: "Handle requests from individuals to access, correct, erase or restrict their personal data.",
    page: "/privacy/requests",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A data subject request is an individual's request about their own personal data. Bayanis handles four types: **access**, **correction**, **erasure** and **restriction**.

Bayanis works out where the person's data lives from the retention set-up: the category's main table (where the person's identifier is), the related tables, the personal-data columns on that path, the retention schedule and any legal holds. The result is a **manifest** the team carrying out the request works from.

Bayanis never stores the person's identity and never touches the data itself.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Requests are answered completely, because every table holding the person's data is listed.
- Legal holds are respected: data under a hold is flagged instead of erased.
- Each request has a deadline and a record of what was done, for the regulator.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Privacy › Data Subject Requests** and create a request with its type and category.
2. Review the manifest of tables and columns.
3. Carry out the request in your systems, record the outcome and close it.

Access: administrators, compliance officers and stewards.`,
      },
    ],
    related: ["data-retention", "impact-assessments"],
  },
  {
    slug: "impact-assessments",
    group: "privacy",
    title: "Data protection impact assessments",
    summary: "Screen a processing activity, assess its risks with facts from the catalog, decide, and keep the assessment current.",
    page: "/privacy/dpia",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A data protection impact assessment (DPIA) checks whether a processing activity puts people's personal data at high risk, and how the risk is reduced. Bayanis runs it in steps:
1. **Screening:** questions that decide whether a full assessment is required. Answers are suggested from the catalog (sensitive data, large scale, sharing outside the organisation or abroad).
2. **Assessment:** questions by section, with the catalog facts shown beside each one.
3. **Risks and measures:** each risk is scored for likelihood and impact before and after measures; measures have an owner and a due date.
4. **Decision** by a compliance officer or administrator: approved, approved with conditions, or rejected. The decided version is frozen and can be downloaded as a PDF.

An assessment is usually about a **processing activity** (from the records of processing), but can be about any catalog asset.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Meets PDPL and GDPR requirements for high-risk processing, with a register of every assessment.
- Answers come from facts in the catalog, not memory.
- The register shows what was approved and when it must be reviewed.`,
      },
      {
        id: "questionnaires",
        title: "Questionnaires",
        body: `Two questionnaires come with Bayanis: Saudi PDPL (one Yes in screening requires an assessment) and GDPR Article 35 with the WP248 criteria (two Yes). Compliance officers and administrators edit them under **Questionnaires**, in English; translations are made in Languages & Translations.

Which questionnaires are used, and the default, is chosen by an administrator in Configuration › Privacy & Retention. Edits apply to assessments not yet decided; questions already answered are retired rather than deleted.`,
      },
      {
        id: "watch",
        title: "Keeping assessments current",
        body: `A daily check:
- **suggests a screening** for tables with sensitive or large-scale personal data, tables shared outside the organisation or abroad, and processing activities that use personal data, when no assessment covers them;
- **flags assessments** whose catalog facts gained something since the decision (new personal-data columns, sensitive categories, sharing, systems reached). An officer reopens the assessment or records that the change is not material;
- sends a reminder when a review date arrives and when a measure becomes overdue.

"Large scale" means 100,000 rows or more.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Privacy › Impact Assessments** and start an assessment, or start one from a suggestion.
2. Answer the screening; if an assessment is required, continue to the assessment tabs.
3. Add risks and measures, then submit for review.
4. The officer decides. Follow measures and review dates in the register.`,
      },
    ],
    related: ["data-retention", "classification", "custom-assets"],
  },
];
