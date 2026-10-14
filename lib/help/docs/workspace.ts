import type { HelpDoc } from "../types";

export const WORKSPACE_DOCS: HelpDoc[] = [
  {
    slug: "dashboard",
    group: "workspace",
    title: "Dashboard",
    summary: "The organisation's data management maturity and compliance at a glance, with catalog search.",
    page: "/dashboard",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `The Dashboard is the organisation-wide view. It shows overall compliance and maturity against the national data management framework (NDI), a card per data management domain, the maturity trend, and a search box over the whole catalog with your recent searches and recently visited assets.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Leadership sees in one screen where the organisation stands and whether it is improving.
- The weakest domains stand out, so effort goes where it is needed.`,
      },
      {
        id: "indicators",
        title: "Indicators and how they are calculated",
        body: `### Domain maturity
Each domain card shows a maturity score from 0 to 5. In the NDI compliance assessment the assessor chooses the level reached for each standard; the domain's score is the **average level of its standards** (not of individual requirement rows). The stars show the same score.

### Domain compliance
**Maturity score ÷ 5 × 100.** A domain at 3.5 shows 70%.

### Overall maturity and overall compliance
The domain scores **weighted by each domain's share**, as set in the NDI framework's domain configuration (a plain average when no shares are set). Overall compliance is the overall maturity ÷ 5 × 100.

### Trend and "last period"
The overall score is recorded once a month. The chart shows these monthly points; "last period" compares today's score with the previous recorded one.

> The Dashboard's figures come from the NDI framework. Other regulations (PDPL, GDPR and others) are scored on their own assessment pages under Data Governance › Compliance.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `- Open a domain card to go to its assessment.
- Type in the search box to find tables, schemas, sources and glossary terms; filter by tag or steward.`,
      },
    ],
    related: ["data-governance", "reports", "search-and-assistant"],
  },
  {
    slug: "homepage",
    group: "workspace",
    title: "Homepage",
    summary: "Your own page: what needs your action, your requests, your domains, saved searches and followed activity.",
    page: "/homepage",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `The Homepage is personal. It is made of widgets you choose and arrange:
- **Needs My Action:** requests and tasks waiting for you.
- **My Requests:** requests you raised and requests on assets you look after.
- **My Domains:** glossary domains you steward, with their open requests.
- **Followed Activity:** changes on the tables, schemas and sources you follow.
- **Saved Searches**, **Recent Assets** and **Quick Links**.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `Add, remove and drag widgets to arrange them; the layout is saved for you. Follow a table from its page to see its changes here.`,
      },
    ],
    related: ["requests-and-collaboration", "dashboard"],
  },
  {
    slug: "search-and-assistant",
    group: "workspace",
    title: "Search and Ask Bayanis",
    summary: "Find any asset by name, tag or steward, or ask the assistant a question in plain language.",
    page: "/search",
    sections: [
      {
        id: "search",
        title: "Search",
        body: `The search box at the top of every page (Ctrl+K) searches assets, schemas, columns and glossary terms. The full search page filters by asset type, tag and stakeholder. Searches can be saved and appear on your Homepage.`,
      },
      {
        id: "assistant",
        title: "Ask Bayanis (the assistant)",
        body: `The chat bubble at the bottom of every page opens the assistant. Ask about your catalog in English or Arabic, for example "Which tables hold national IDs?", "What is the data quality of the customer table?" or "Which regulations are we least compliant with?".

The assistant answers only from what it looks up in Bayanis while answering, and says so when it cannot find something. It works on metadata, statistics and statuses and never shows row-level data values. It sees what any signed-in user can see.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Anyone can find data without knowing the systems.
- Quick answers for managers without building a report.`,
      },
    ],
    related: ["data-catalog", "ai-providers"],
  },
  {
    slug: "requests-and-collaboration",
    group: "workspace",
    title: "Requests, access and discussions",
    summary: "Raise a request about an asset, ask for access, follow it to resolution, and discuss with colleagues.",
    page: "/request-access",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `**New Request** lets anyone:
- report a data issue, ask to update a definition, ask to certify an asset, or raise another request about an asset;
- ask for access to a data source, schema or table, or to a domain of Bayanis.

Each request follows the [workflow](/help/workflows) set for its type and goes to the right owner, steward or team. You are notified at each step, and you can follow it under **Requests** in your profile menu.

**Discussions** are threads about an asset or a question, with mentions of assets (#) and people.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Data issues are reported where the data is described, and reach the person who can fix them.
- Access is granted by the asset's real owner, with a record of who approved it and why.
- Knowledge stays next to the asset instead of in e-mail.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Choose **New Request** in the menu, or the request button on an asset's page.
2. Pick the type, the asset and describe what you need.
3. Follow progress from the notification bell, your Homepage and **Requests**.
4. Approvers approve, reject or return a request with a comment.`,
      },
    ],
    related: ["workflows", "homepage"],
  },
];
