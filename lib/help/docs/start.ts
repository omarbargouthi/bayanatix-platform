import type { HelpDoc } from "../types";

export const START_DOCS: HelpDoc[] = [
  {
    slug: "getting-started",
    group: "start",
    title: "Getting started with Bayanis",
    summary: "What Bayanis is, how the menu is organised, and where to begin.",
    sections: [
      {
        id: "what",
        title: "What Bayanis is",
        body: `Bayanis is a data governance platform. It keeps one inventory of your organisation's data (the catalog), and builds the governance work on top of it: definitions, ownership, classification, quality, privacy, sharing, open data, freedom of information and regulatory compliance.

Bayanis reads the **structure** of your systems (databases, files, APIs, pipelines). It does not copy your data. Where a feature needs to look at values, such as data quality rules or live sample data, it reads them from the source when needed and keeps only results.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- **One place to find data.** People search one catalog instead of asking around for which table holds what.
- **Clear accountability.** Every asset can have an owner and stewards, and requests go to the right person.
- **Evidence for regulators.** Compliance assessments, registers, impact assessments and audit logs give you the records that regulations such as the NDI, PDPL and GDPR ask for.
- **Less risk with personal data.** Personal data is found, classified, masked and tracked through lineage to every copy.
- **Measurable progress.** Indicators and reports show coverage, quality and maturity over time.`,
      },
      {
        id: "menu",
        title: "How the menu is organised",
        body: `| Part of the menu | What you find there |
|---|---|
| Top | Dashboard, your Homepage, Reports, AI Enrichment, Custom Assets and New Request |
| Domains | Data Governance, Data Catalog (Data Assets, Glossaries, Data Lineage), Data Quality, Classification, Data Privacy (Data Retention, Data Subject Requests, Impact Assessments), Data Sharing, Open Data and FOI Requests |
| Administration | Users, tags, bulk operations, workflows, data sources, audit logs, configuration, AI providers, regulation setup, report KPIs and custom asset types (administrators only) |

Menu items with sub-pages open and close with the arrow beside them. The menu only shows the domains you have access to.

Your name at the top of the menu opens your profile, your requests, this Help Center and sign out. The globe icon changes the language.`,
      },
      {
        id: "first-steps",
        title: "First steps",
        body: `1. **Administrators:** connect your first data source in Administration › Data Sources and run a crawl. See [Data sources and crawling](/help/data-sources).
2. Add users and give them roles in Administration › User Management. See [Users, roles and access](/help/roles-and-access).
3. Open **Data Catalog › Data Assets** to browse what was found, and assign owners and stewards.
4. Run **Classification** to find personal and sensitive data.
5. Add **Data Quality** rules on the columns that matter most.
6. Use the **Dashboard** and **Reports** to follow progress.`,
      },
      {
        id: "help",
        title: "Getting help on a screen",
        body: `A small **?** beside an indicator explains how it is calculated, with a link to the matching page here. Use the search box at the top of the Help Center to find a topic, or ask the assistant (the chat bubble at the bottom of every page) a question about your catalog.`,
      },
    ],
    related: ["roles-and-access", "data-catalog", "connectors"],
  },
  {
    slug: "roles-and-access",
    group: "start",
    title: "Users, roles and access",
    summary: "The four user roles, domain access, and roles scoped to a source, schema or table.",
    page: "/admin/user-management",
    sections: [
      {
        id: "overview",
        title: "Overview",
        body: `What a person can see and do in Bayanis depends on three things:
- their **user role**, which sets their overall level;
- their **domain access**, which decides which domains (for example Data Quality or FOI) they can open and whether they can change things there;
- **role assignments**, which give rights on a specific data source, schema or table (for example "steward of the Finance database").`,
      },
      {
        id: "roles",
        title: "User roles",
        body: `| Role | Typical person | What they can do |
|---|---|---|
| Administrator | Data management office, platform owner | Everything, including Administration, configuration and final decisions |
| Data Steward | Business or technical data steward | Edit metadata, manage quality rules, handle requests on the assets they look after |
| Compliance Officer | Data protection officer, compliance team | Privacy work: data subject requests, impact assessment decisions, retention, legal holds |
| Viewer | Any employee | Search and read the catalog, raise requests |`,
      },
      {
        id: "domains",
        title: "Domain access",
        body: `Six domains are access-controlled: Governance, Data Quality, Data Privacy, Data Sharing, Open Data and FOI. A person gets **Write** or **Read** access to a domain through a role assigned to that domain, given to them directly or to a team they belong to. Without such a role the domain does not appear in their menu. Administrators always have Write.

The Data Catalog and Classification are open to every signed-in user. Anyone can ask for access to a domain from **New Request**; approving the request gives the domain's read-only role.`,
      },
      {
        id: "scoped",
        title: "Owners, stewards and scoped roles",
        body: `Every source, schema, table and column can have an **owner**, a **business steward** and a **technical steward**. They are set on the asset itself, inherited downwards (a table inherits from its schema, which inherits from its source) and can be overridden lower down.

Roles created in User Management can also be assigned for one data source, schema or table only. A person with such a role can edit metadata for that scope without being a steward everywhere.

Requests about an asset (fix a data issue, update a definition, grant access) are routed to these people through [workflows](/help/workflows).`,
      },
      {
        id: "how",
        title: "How to manage users",
        body: `1. Go to Administration › User Management.
2. **Users** tab: add a user, set their user role and whether the account is active.
3. **Roles** tab: create roles with specific rights (for example read metadata, write metadata, read or write a domain) and assign them to a person or a team, globally, for a domain, or for one source, schema or table.
4. **Teams** tab: group people, so a role or a workflow stage can be given to a whole team.`,
      },
    ],
    related: ["workflows", "getting-started"],
  },
];
