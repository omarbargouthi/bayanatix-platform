import type { HelpDoc } from "../types";

export const DOMAIN_DOCS: HelpDoc[] = [
  {
    slug: "data-governance",
    group: "domains",
    title: "Data Governance",
    summary: "Your governance framework documents, operational registers, and compliance assessments against regulations.",
    page: "/governance",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Data Governance has three parts:
- **Framework:** the documents of your data governance programme, in nine sections: policies, processes, strategy, operating model, roadmap, standards, training, communication and regulatory. The roadmap tracks milestones and deliverables; communication holds a plan of sessions, updates and announcements.
- **Registers:** operational lists your programme keeps, with the history of every entry.
- **Compliance:** assessments against regulations and frameworks: the NDI (national data management framework), PDPL, the NCA Data Cybersecurity Controls, BCBS 239, PIPEDA, AI ethics principles and others. New regulations can be added.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- One place for the evidence a regulator or auditor asks for.
- Progress is measured, not estimated: each requirement has a status or maturity level, evidence and an owner.
- Several regulations are tracked side by side.`,
      },
      {
        id: "compliance",
        title: "How compliance is scored",
        body: `There are two kinds of assessment:
- **Maturity** (NDI and the AI index): the assessor chooses the maturity level reached for each standard, from 0 (no capability) to 5 (innovation). A domain's score is the average level of its standards; the overall score is the domains' scores weighted by their configured share, or a plain average when no shares are set. Compliance is the overall score ÷ 5 × 100 (see [Dashboard](/help/dashboard)).
- **Compliance only** (PDPL and most others): each requirement is Compliant, Partially compliant, Non-compliant, Not applicable or Not started. **Compliance = compliant requirements ÷ all requirements × 100.** Partially compliant counts as not compliant, and Not applicable requirements stay in the total.

Each regulation's score is recorded once a month to draw its trend.

Submitted evidence can go through a compliance review (confirmed by a steward or administrator, then endorsed by an administrator).`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. **Framework:** open a section, upload documents, set owners and review dates. In Roadmap, add milestones and deliverables and update their status.
2. **Registers:** open a register and add or edit entries; deleted entries can be restored by administrators.
3. **Compliance:** pick a regulation, go through its requirements, set the status or level, attach evidence and assign actions.
4. Administrators add a regulation with **+ New Regulation** and edit requirements in Administration › Regulation Setup.

> Importing a file into an existing regulation replaces all of its requirements. Export first if you need a copy.`,
      },
    ],
    related: ["dashboard", "reports"],
  },
  {
    slug: "data-quality",
    group: "domains",
    title: "Data Quality",
    summary: "Rules that check your data, their results, scores by dimension, and the indicators on the Data Quality page.",
    page: "/quality",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A data quality **rule** checks a table or column, for example "national ID is never empty" or "order date is not in the future". Rules belong to a **dimension**: completeness, validity, uniqueness, consistency, accuracy, conformity or freshness (timeliness). They run on demand or on a schedule, and every run is kept with its result and examples of failing values.

Rule templates: not null, completeness rate, pattern (regular expression), allowed values, range, unique, row count threshold, freshness, referential check, and custom SQL.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Problems are found before they reach reports and decisions.
- Owners are told when a rule fails, and a data issue can be raised directly.
- Scores show whether quality is improving, per table, per dimension and for critical data elements.`,
      },
      {
        id: "indicators",
        title: "Indicators and how they are calculated",
        body: `### A rule's score
Each run checks a number of records. **Score = 100 − the percentage of records that failed.** A run with no records to check has no score and shows as an error.

### A rule's status
The thresholds are minimum scores. With a warning threshold of 95 and a failure threshold of 80:
- 95 or more: **Passed**, even if some records failed;
- from 80 to under 95: **Warning**;
- under 80: **Failed**.

A rule without thresholds is strict: it fails as soon as one record fails.

### On the Data Quality dashboard
- **Total rules / Active rules:** all rules, and those switched on.
- **Runs today:** rule runs since midnight.
- **Passing:** rules whose latest run passed. **Failing:** rules whose latest run failed or ended in error.
- **Avg score:** the average of every rule's latest score.
- **Run trends (14 days):** passed and failed runs per day.

### A table's score
On a table's Data Quality tab, each dimension is the average latest score of the table's active rules in that dimension, and the overall score combines the dimensions that have rules.

### Data quality of critical data elements
See [Data Catalog › Indicators](/help/data-catalog).`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open a table's **Data Quality** tab, or the Rule Library on the Data Quality page, and choose **New Rule**.
2. Pick the template, the column, the dimension and the severity; set the thresholds and, if you want, a schedule.
3. Run it. Open a run to see failing examples.
4. Use **Suggest Rules** on a table to get rules from profiling and AI, and accept the ones you want.`,
      },
      {
        id: "notes",
        title: "Good to know",
        body: `- Rules run against **PostgreSQL** sources today. See [Connector coverage](/help/connectors).
- Failing examples are kept for 90 days, and values of personal-data columns are not kept.`,
      },
    ],
    related: ["data-catalog", "ai-enrichment", "reports"],
  },
  {
    slug: "classification",
    group: "domains",
    title: "Classification",
    summary: "Find personal and sensitive data, set each column's sensitivity, and mark columns as business or technical.",
    page: "/classification",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Classification decides how each column must be handled:
- **Sensitivity level** (for example Public, Internal, Confidential, Secret, Top Secret), given by linking a classification term.
- **Personal data:** whether the column holds personal information and of which category, including sensitive categories such as health.
- **Business or technical:** whether the column carries business meaning.

Bayanis suggests classifications; stewards review them. A suggestion never overwrites a decision a steward already made; if a new run disagrees, the suggestion is marked for another look.`,
      },
      {
        id: "detection",
        title: "How personal data is detected",
        body: `Each **sensitive information type** (national ID, IBAN, e-mail, phone number and others, by country) has patterns for column names and for values.
- Where live values can be read (PostgreSQL), a sample of values is checked against the patterns, together with the column name.
- Elsewhere the column name and type are the only evidence.

The result is a confidence. Suggestions above the auto-accept band can be accepted automatically; those below the minimum confidence are not shown. These settings are in Configuration › Sensitive Information Types.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- You know where your personal and sensitive data is, which every privacy law asks for.
- Sensitivity drives protection elsewhere: masking in sample data, approvals for sharing and open data, impact assessments.
- Classification flows to copies of a column through lineage.`,
      },
      {
        id: "indicators",
        title: "Indicators",
        body: `The Classification page counts columns: total, classified and unclassified, critical data elements, personal data, business and technical, and the most frequent personal data categories. "Classified" means the column has a classification term.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Classification** and run a scan for a source, schema or table (scans also run after each crawl).
2. Review the queue: accept, change or reject each suggestion.
3. Classification changes go through the classification review workflow when one is set up.`,
      },
    ],
    related: ["data-catalog", "data-lineage", "impact-assessments"],
  },
  {
    slug: "data-sharing",
    group: "domains",
    title: "Data Sharing",
    summary: "Data sharing agreements with other organisations, from request to approval, renewal and end.",
    page: "/sharing",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A **data sharing agreement** records what data is shared with which party, for what purpose, on which legal basis, under which terms and for how long. The datasets are picked from the catalog, so the agreement knows their classification and personal data.

An agreement moves through: Draft › Validation › Owner review › Privacy review (when personal data is included) › Data management office review › Executive approval (for Secret data and above) › Approved › Active, and later Suspended, Terminated, Expired or renewed. A light path with owner approval only applies when the scope and classification allow it.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Every share is approved by the right people and can be shown to a regulator.
- Personal and secret data automatically gets the extra reviews it needs.
- Expiry and renewal are tracked, so shares don't run on forever.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Sharing** and create an agreement.
2. Fill in the tabs: General, Datasets, Terms, Authorizations.
3. Submit. Each reviewer approves, rejects or returns it with a comment on the Approvals tab.`,
      },
    ],
    related: ["open-data", "classification"],
  },
  {
    slug: "open-data",
    group: "domains",
    title: "Open Data",
    summary: "Publish datasets to the public with the approvals your policy requires.",
    page: "/open-data",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Open Data manages datasets your organisation publishes. A dataset is built from catalog assets, described, and approved before publication:
- with personal data involved: steward › owner › privacy officer › data management office;
- without personal data: steward › owner › administrator.

A dataset can also come from a freedom of information request that was answered by publishing the data.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Meets open data obligations with a clear approval trail.
- Classification is checked before anything is published, so personal or restricted data is not released by mistake.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Open Data** and choose **New**.
2. Pick the source assets and describe the dataset.
3. Submit it for approval and follow it on the list by status.`,
      },
    ],
    related: ["foi", "data-sharing"],
  },
  {
    slug: "foi",
    group: "domains",
    title: "Freedom of Information requests",
    summary: "Receive requests from the public, process them within the legal time, and answer by delivery or open data.",
    page: "/foi",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Members of the public submit requests on a public form, without an account, and follow them with a tracking link. Inside Bayanis each request is a case with its stages, fees, deadlines and documents.

A request is answered either as a **one-off delivery** to the requester or by **publishing the data as open data**. The response time, fees and appeal window are set in Configuration › FOI.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Requests are answered within the legal deadline, with the time remaining always visible.
- Every decision and document is kept for appeals and audits.
- Answers that are useful to everyone become open data.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **FOI Requests** to see the queue and the time left on each case.
2. Open a case, record the decisions at each stage and attach the response.
3. Choose delivery or open data; the technical compilation stage waits until the linked open dataset is ready.`,
      },
    ],
    related: ["open-data", "reports"],
  },
];
