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
        body: `Four questionnaires come with Bayanis:
- **Saudi PDPL**: one Yes in screening requires an assessment.
- **GDPR Article 35**, with the WP248 criteria: two Yes require an assessment.
- **Québec Law 25**: one Yes requires an assessment: a project to acquire, develop or overhaul a system holding personal information (s. 3.3), communication outside Québec (s. 17), or communication without consent for research (s. 21). The person in charge of the protection of personal information is consulted from the start.
- **Canada PIPEDA**: questions follow the ten fair information principles. PIPEDA itself does not require an assessment; the Privacy Commissioner recommends one for new or changed programs, so here it is a recommendation.

Compliance officers and administrators edit them under **Questionnaires**, in English; translations are made in Languages & Translations.

Which questionnaires are used, and the default, is chosen by an administrator in Configuration › Privacy & Retention. A questionnaire linked to a compliance framework (Governance › Compliance) is offered only while that framework is marked applicable in Regulation Setup. Edits apply to assessments not yet decided; questions already answered are retired rather than deleted.`,
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
    related: ["data-retention", "data-breaches", "classification", "custom-assets"],
  },
  {
    slug: "data-breaches",
    group: "privacy",
    title: "Personal data breaches",
    summary: "Record every breach of personal data, see which data and people it affects, and notify each regulator in time: within 72 hours under PDPL and GDPR, as soon as feasible under Canada's laws.",
    page: "/privacy/breaches",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `The breach register under **Data Privacy › Data Breaches** records every suspected or confirmed breach of personal data, whether or not it has to be reported, as the Saudi PDPL, the GDPR, Canada's PIPEDA, Québec's Law 25 and Ontario's PHIPA require. For each breach it keeps:
- what happened, when the organisation became aware of it, the kind of breach and its cause;
- the **laws that apply**, each with its own regulator and rule;
- the **affected data**: the systems, tables or columns involved, with the catalog's facts about the personal data in them (categories, sensitive data, row counts, copies elsewhere, sharing);
- the **risk** to the people concerned;
- the **notifications**: to each regulator, and to the people concerned;
- the **measures** taken to contain it and prevent it happening again, and a timeline of every step.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Meets each law's duty to notify its regulator (within 72 hours under PDPL and GDPR, as soon as feasible under PIPEDA, promptly under Law 25) and to keep a record of every breach.
- In minutes, the catalog shows which personal data was in the affected systems and how many people it may concern, instead of a manual investigation.
- Deadline reminders, and a regulator report ready to send.`,
      },
      {
        id: "deadline",
        title: "Laws, deadlines and what must be notified",
        body: `Each breach lists the laws that apply. A new breach starts with the laws whose compliance framework is marked applicable in Regulation Setup (Configuration › Privacy & Retention › Data breach laws shows which); the handler can change them on the breach, and each regulator card links to the law's framework. Each law adds a notice to its regulator:

| Law | Regulator | When to notify the regulator | Records |
|---|---|---|---|
| Saudi PDPL (Implementing Regulation, art. 24) | SDAIA | Within 72 hours of becoming aware, for any risk to people | — |
| EU GDPR (art. 33–34) | Lead supervisory authority | Within 72 hours of becoming aware, unless unlikely to result in a risk | Every breach documented |
| Canada PIPEDA (s. 10.1) | Office of the Privacy Commissioner | As soon as feasible, when there is a real risk of significant harm | Every breach kept 24 months |
| Québec Law 25 (Private Sector Act, ss. 3.5–3.8) | Commission d'accès à l'information | Promptly, when there is a risk of serious injury | Every incident kept at least 5 years |
| Ontario PHIPA (s. 12(2); O. Reg. 329/04, s. 6.3) | Information and Privacy Commissioner | In the prescribed circumstances, such as theft, a significant breach or a pattern of similar breaches | Every breach counted in the annual report |

Deadlines run from the time recorded as *When the organisation became aware*. Bayanis never deletes a breach, which meets every record-keeping period.

| Risk to the people concerned | Regulators | Data subjects |
|---|---|---|
| Not assessed yet | Every notice is treated as required | Required under PHIPA |
| Unlikely to put people at risk | Not required under any law; record why | Required under PHIPA only |
| Risk to people | Required under PDPL and GDPR; not under the Canadian laws | Required under PHIPA only |
| High risk to people | Required under every law that applies | Required without undue delay, or record why not |

Under PIPEDA, *high risk* means a real risk of significant harm; under Law 25, a risk of serious injury; under PHIPA, one of the prescribed circumstances. PHIPA requires telling the people whose health information was stolen, lost, or used or disclosed without authority at the first reasonable opportunity, whatever the risk.

When the affected assets hold personal data, the catalog suggests a level: **High** for sensitive categories, large scale (100,000 rows or more) or unencrypted personal data columns, otherwise **Risk**; **Unlikely** when they hold none. The officer decides.

The register shows each notice as due, due within 24 hours, overdue, to notify as soon as feasible, or made on time or late. For the 72-hour laws, an hourly check reminds the handler and the compliance officers once when less than 24 hours are left and once when the deadline has passed (Configuration › Scheduling › Data breaches).`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Anyone who suspects a breach reports it: **New Request › Report a data breach** (open to every user, also from a table's New Request), or **Report a breach** on this page. A short description and when it became known are enough; compliance officers are notified at once.
2. The compliance officer (or administrator) assigns a handler, checks the laws that apply, adds the affected assets and records the risk.
3. For each law, notify its regulator and record when, with their reference; notify the data subjects when the risk is high. **Regulator report (PDF)** gives the details a notification asks for.
4. Record the containment and prevention measures, then **Close** the breach. Bayanis lists anything still missing. A report that turns out not to involve personal data is closed as **Not a breach**.

Compliance officers and administrators see every breach. The person who reported a breach, and its handler, see that breach; only officers, administrators and the handler can change it. Breaches are never deleted.`,
      },
    ],
    related: ["impact-assessments", "data-subject-requests", "data-catalog"],
  },
];
