import type { HelpDoc } from "../types";

export const REPORT_DOCS: HelpDoc[] = [
  {
    slug: "reports",
    group: "reports",
    title: "Reports and KPIs",
    summary: "Standard status reports per data management domain, domain scorecards, and the KPIs behind them.",
    page: "/reports",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Reports give a standard status for each data management domain, aligned with the monitoring evidence the NDI asks for:

| Report | What it covers |
|---|---|
| Data Catalog / Metadata | Cataloged assets, ownership and metadata completeness |
| Data Quality | Rule coverage, pass rates and open issues |
| Data Classification | Classification coverage and the unclassified backlog |
| Data Sharing | Agreements, requests and response times |
| Open Data | Publication pipeline and response times |
| FOI | Request status, fulfilment time and appeals |
| Personal Data Protection | Personal data classification and consent coverage |
| Retention | Schedules, overdue assets and legal holds |
| Data Governance executive summary | Governance coverage, certification and open tasks |

**Domain scorecards** show all of these for one business domain (for example Customer or Finance). Other reports cover personal data access by role and data sources.`,
      },
      {
        id: "read",
        title: "How to read a report",
        body: `- **KPI cards** show the current value against its target, coloured green, amber or red. Each card says whether higher or lower is better.
- **12-month trend** comes from monthly snapshots, taken automatically on the 1st of each month (or with **Capture Snapshot**).
- **Drill-down table** lists the items behind the figures (for example the tables with gaps), filtered by business domain, source and owner.
- **Export** to PDF (English or Arabic) or Excel. Exports are recorded.

Stewards limited to a business domain only see that domain's rows.`,
      },
      {
        id: "kpis",
        title: "Managing KPIs",
        body: `Administrators manage KPIs in Administration › Report KPI Admin: names, targets, thresholds and whether higher is better. Custom KPIs can be written in SQL; they run with a read-only account that cannot see passwords or credentials.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Ready-made evidence for regulators and the data management office.
- The same definitions month after month, so progress is comparable.`,
      },
    ],
    related: ["dashboard", "data-governance"],
  },
];
