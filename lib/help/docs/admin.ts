import type { HelpDoc } from "../types";

export const ADMIN_DOCS: HelpDoc[] = [
  {
    slug: "data-sources",
    group: "admin",
    title: "Data sources and crawling",
    summary: "Connect a source, choose what to read, run or schedule a crawl, and review what changed.",
    page: "/admin/sources",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A **data source** is a connection Bayanis reads metadata from: a database, a folder of files, an API specification, a folder of Power BI files or a pipeline workspace. A **crawl** reads the source's structure and updates the catalog. Bayanis only reads; it never changes anything in the source.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- The catalog fills itself instead of being typed in.
- Scheduled crawls keep it current; new, changed and dropped tables and columns are detected and sent to stewards for review.
- Owners and stewards can be set once per source and inherited by everything found in it.`,
      },
      {
        id: "how",
        title: "How to add a source",
        body: `1. Go to Administration › Data Sources and choose **Add**.
2. Pick the type and enter the connection details: host, port, database and credentials for a database; a folder or file path for files; a path or URL for an API specification; a folder or the live service for Azure Data Factory or Synapse.
3. Use **Test connection**.
4. Set the crawl options:
   - schemas to include or exclude, and table name patterns to skip;
   - profiling: off, a number of rows, a percentage, or the full table;
   - default owner, business steward and technical steward;
   - lineage scanning options (PostgreSQL);
   - a schedule (cron expression) for automatic crawls.
5. Run **Crawl now**. Progress and the log are in Administration › Audit & Logs › Job Logs, and you are notified when it finishes.`,
      },
      {
        id: "after",
        title: "What happens after a crawl",
        body: `- New tables and columns are added; changes and removals are recorded in each table's Activity and raise a metadata-update review for its stewards (not on the first crawl).
- Foreign keys are recorded as relationships between tables.
- Columns are classified automatically (personal and sensitive data, business or technical), as suggestions for review.
- Lineage is scanned where the source supports it.`,
      },
      {
        id: "security",
        title: "Credentials",
        body: `Passwords and client secrets are stored encrypted, or, when your organisation keeps them in HashiCorp Vault, Bayanis stores only where they are in Vault and reads them each time it connects (see [Encryption keys](/help/configuration#encryption-keys)). Use a read-only account on the source. Bayanis needs to read the system catalog (tables, columns, keys, comments, view definitions) and, for profiling, data quality rules and sample data, to read the tables.`,
      },
    ],
    related: ["connectors", "data-catalog", "data-lineage"],
  },
  {
    slug: "connectors",
    group: "admin",
    title: "Connector coverage",
    summary: "What each connector reads, what it does not, and which features work on which sources.",
    page: "/admin/sources",
    sections: [
      {
        id: "summary",
        title: "Summary",
        body: `Bayanis has twelve connector types. All of them add assets to the catalog; they differ in how much detail they read and in which features can use the live data.

> PostgreSQL has the fullest coverage. It is the only source where data quality rules, live sample data and live value sampling for classification run today.`,
      },
      {
        id: "databases",
        title: "Databases",
        body: `| What is read | PostgreSQL | SQL Server | MySQL | Oracle |
|---|---|---|---|---|
| Schemas, tables, views, columns, data types, nullability | Yes | Yes, but view columns are not read | Yes | Yes |
| Materialized views | Lineage scan only | n/a | n/a | Yes |
| Primary keys | Yes | Yes | Yes | Yes |
| Foreign keys (also composite) | Yes | Yes | Yes | Yes |
| Table and column comments | Yes | Yes (MS_Description extended properties) | Yes | Yes |
| View definitions | Yes | Yes | Yes | Yes |
| Row counts and column profiles (nulls, distinct, min, max, frequent values) | Yes | No | No | No |
| Lineage from views, functions and procedures | Yes | No (view anatomy only) | No (view anatomy only) | No (view anatomy only) |
| Data quality rules run on the data | Yes | No | No | No |
| Live sample data (masked) | Yes | No | No | No |
| Classification with sampled values | Yes | Names and types only | Names and types only | Names and types only |

**Oracle** needs the \`oracledb\` driver and Oracle Instant Client installed on the Bayanis server; without them the crawl stops with a message saying so. A crawl of Oracle reads the schema given as the default schema, or the connecting user's schema.`,
      },
      {
        id: "files",
        title: "Files and API specifications",
        body: `| Connector | What it reads | What it does not |
|---|---|---|
| CSV files | Each file in the folder becomes a table; columns from the first row; types inferred from the values; row count; profiles when profiling is on | Keys, relationships, descriptions |
| Excel workbooks | Each sheet becomes a table (named file_sheet when there are several); same as CSV | Formulas, merged headers, more than one header row |
| JSON files | An array becomes a table with one row per element; an object becomes one table per array-valued key; nested values are typed "json" | Deeply nested structures are not flattened |
| REST API (OpenAPI / Swagger, JSON or YAML) | The objects declared under components/schemas (or definitions) and their properties | The live service is never called; endpoints and parameters are not cataloged |
| SOAP web service (WSDL) | The named complex types in the WSDL's embedded schema | The live service is never called; operations are not cataloged |

API specifications can be a file or a URL; for a URL behind basic authentication, enter a user name and password.`,
      },
      {
        id: "lineage",
        title: "Lineage and BI connectors",
        body: `| Connector | What it reads | What it does not |
|---|---|---|
| Power BI Desktop Folder (.pbix) | Every .pbix in a folder (unchanged files are skipped on re-scan): Power Query sources, tables and columns, report pages and visuals, and lineage from source to visual | DAX measures and the full column list need Python with the pbixray package on the server; without it only the Power Query sources are read. The Power BI service (online workspaces) is not scanned. |
| Single .pbix upload | The same, for one file, from the lineage page | Same |
| SSIS package (.dtsx upload) | Data flows, sources, destinations and column mappings | SSISDB catalog and .ispac projects; one .dtsx at a time |
| Azure Data Factory | Pipelines, Copy activities, mapping data flows and notebooks, as processes with table and column links, from the Git folder, an exported ARM template, or the live factory with a service principal | Run history; activities other than those listed |
| Azure Synapse Analytics | The same for a Synapse workspace (Git folder or development endpoint) | Same; to catalog its SQL pools, add them as a SQL Server source |
| Excel lineage import | Links in the lineage template, scanned links excluded | |

Tables and files named by these connectors are matched to the catalog. Anything not found becomes a placeholder in **Stitching review** instead of a guess.`,
      },
      {
        id: "not-covered",
        title: "Not covered today",
        body: `- Cloud data warehouses with their own connector (Snowflake, BigQuery, Redshift, Databricks), NoSQL databases, SAP, Salesforce and other applications. Where they expose a PostgreSQL or SQL Server compatible endpoint, that connector can often be used.
- Stored procedure lineage outside PostgreSQL.
- Live Power BI service scanning through its admin API.
- Calling REST or SOAP services to read actual data.
- Profiling, data quality execution and sample data on sources other than PostgreSQL.`,
      },
    ],
    related: ["data-sources", "data-lineage"],
  },
  {
    slug: "workflows",
    group: "admin",
    title: "Workflows and requests routing",
    summary: "Approval stages for each request type, who handles each stage, and the time allowed.",
    page: "/admin/workflows",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `A workflow sets the stages a request goes through before it is resolved. Bayanis comes with workflows for data issue resolution, metadata updates, asset certification, access management, general requests, classification review, open data approval (with and without personal data), clear-text access to personal data, glossary governance overrides, compliance review and data asset clean-up.

Each stage has an **assignee** and a time limit (SLA, in hours). The assignee can be a role, a team, a named user, the requester, or the asset's own owner or steward, worked out from the asset's governance.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Requests reach the accountable person automatically, with no one routing them by hand.
- Sensitive actions (clear-text personal data, sharing) need the approvals your policy requires.
- SLAs make delays visible.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Go to Administration › Workflows and pick a request type.
2. Add stages in order, choose the assignee for each and set the SLA.
3. Save.

People see the requests waiting for them on their Homepage (Needs My Action) and under **Requests** in their profile menu.`,
      },
    ],
    related: ["requests-and-collaboration", "roles-and-access"],
  },
  {
    slug: "bulk-operations",
    group: "admin",
    title: "Bulk operations",
    summary: "Export catalog metadata to Excel, edit it offline and upload it back in one go.",
    page: "/bulk-operations",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Download a scope of the catalog (a source, schema or tables) to Excel with its descriptions, owners, stewards, terms, custom attributes and lineage. Edit it offline and upload it. Or download an empty template to create new records.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Document hundreds of tables at once, or hand a workbook to a business team to fill in.
- Bring in metadata from another tool or a spreadsheet you already have.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Bulk Operations** and choose **Download** with a scope, or the empty template.
2. Edit the file. Leave the ID column empty on new rows.
3. **Upload** it. It is checked and applied as a background job; there is no separate approval step.
4. Rows that fail are collected in a **rejected records** file you can fix and upload again.
5. A Lineage sheet is applied as lineage changes (through lineage approval when a workflow is set up); scanned links in it are read-only and skipped.

You can only change assets you are allowed to edit. Jobs and their files are listed in Audit & Logs › Job Logs.`,
      },
    ],
    related: ["data-catalog", "audit-logs"],
  },
  {
    slug: "audit-logs",
    group: "admin",
    title: "Audit and logs",
    summary: "Who changed what, background jobs, exports and imports, access to live data, and consent.",
    page: "/admin/audit-logs",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Administration › Audit & Logs has five tabs:
- **Audit Log:** every change to metadata, settings and records, with who, when, and the old and new value.
- **Job Logs:** crawls, bulk downloads and uploads, and other background jobs, with their console output.
- **Export & Import Logs:** exports, imports and other jobs started by users, with their files.
- **Data Access:** every view of live sample data, and whether personal data was shown masked or in clear text.
- **Consent:** every decision on the user consent notice, and active users who haven't accepted the current version.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Accountability and evidence for auditors and regulators.
- Troubleshooting: see why a crawl or upload failed.
- Privacy oversight: who looked at personal data, and under which approval.`,
      },
    ],
    related: ["data-sources", "bulk-operations"],
  },
  {
    slug: "configuration",
    group: "admin",
    title: "Configuration",
    summary: "Lists of values, rules, privacy and retention settings, branding, scheduling, security and AI settings.",
    page: "/admin/configuration",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Administration › Configuration holds the settings that shape Bayanis for your organisation. Changes apply to everyone.

| Area | What you set |
|---|---|
| Data Management | Lists of values (table types, classification levels, data domains, quality dimensions and severities, governance roles), custom attributes, sample data, follow settings, sensitive information types, table and column type rules |
| Privacy & Retention | Data categories, consent notice, impact assessment questionnaires in use and the default |
| Branding | Your logo, shown next to Bayanis |
| Scheduling | Automatic jobs (report snapshots, regulation trends, the daily impact assessment check) and their schedules |
| Security | Sign-in and password settings, and the encryption key for stored passwords and keys |
| Compliance | Compliance assessment settings |
| AI | AI enrichment settings: thresholds, freshness window, token budget; Ask Bayanis: whether users may apply its classification advice (off by default) |
| FOI | Freedom of information settings such as fees and response times |`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `Pick an area in the list on the left, change the values and save. Names and labels you add here are translated in Languages & Translations.`,
      },
      {
        id: "encryption-keys",
        title: "Encryption keys and key rotation",
        body: `Data source passwords, AI provider keys, LDAP bind passwords and the SSO client secret are stored encrypted. The key is never stored in the database: it is held in the server environment (AES-256-GCM), or in your HashiCorp Vault. Each stored value records which key encrypted it.

**Configuration › Encryption Keys** shows the current key and any previous keys (by a short identifier, never the key itself), how many stored secrets use each, and when they were last re-encrypted.

### Rotating the key
1. The server administrator generates a new key and sets it as the current key, keeping the old one as a previous key, then restarts Bayanis.
2. Click **Re-encrypt with the current key**. Each secret is opened with its old key, encrypted with the new one and checked before it is saved. Nobody re-enters a password.
3. When the old key shows *no longer used*, the server administrator removes it.

Every re-encryption is recorded in the audit log. A secret that cannot be opened with any configured key is listed by name, so it can be entered again.

### Keeping the key in HashiCorp Vault
Bayanis can use the Transit engine of your HashiCorp Vault instead: Vault holds the key and does the encryption, and Bayanis stores only what Vault returns.
1. The server administrator sets the Vault address, the key name and how Bayanis signs in to Vault (token, AppRole or Kubernetes) in the server environment, keeping the local key for now, and restarts Bayanis.
2. Click **Test**, then **Move … to HashiCorp Vault Transit**. Every stored secret moves to Vault; nobody re-enters a password.
3. When nothing uses the local key any more, the server administrator removes it.

With Vault, **Rotate key in Vault** creates a new key version, and re-encryption happens inside Vault, so the passwords never pass through Bayanis. If Vault cannot be reached, sign-in with local accounts keeps working; connecting to data sources and AI providers fails with a clear message until Vault is back.

### Passwords kept in Vault
When Vault is configured, every password field (data sources, AI provider keys, LDAP bind passwords, the SSO client secret) offers **Vault reference** next to **Password**. Enter where the password is kept, as *path#field* (for example \`secret/bayanis/finance-db#password\`), and click **Check** to confirm Bayanis can read it. Bayanis then stores only that location and reads the password from Vault each time it connects, so your security team can change it in Vault without touching Bayanis. The server administrator can limit which Vault paths may be used. On Encryption Keys, these fields are counted as **Vault reference**, and re-encryption leaves them as they are.`,
      },
    ],
    related: ["languages", "ai-providers"],
  },
  {
    slug: "languages",
    group: "admin",
    title: "Languages and translations",
    summary: "Add languages and translate the interface and your own content in one place.",
    page: "/admin/languages",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Bayanis can run in any number of languages. English is the base language; every other language is translated in Administration › Languages & Translations. This covers both the interface and your own content: list values, custom asset names, regulation requirements, impact assessment questionnaires and this Help Center.

Content is always written in English on its own screen. When the English text changes, its translations are marked **out of date** and the English is shown until someone updates them.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. **Languages** tab: add a language, switch it on, choose the default, and whether users may pick their own.
2. **Categories** tab: how much of each area is translated.
3. **Workbench** tab: filter by category and status, edit a translation, mark it verified, or translate many at once with AI and then review.
4. Export to Excel for a translator and import the file back.

The Help Center's texts are in the category **Help Center**.`,
      },
    ],
    related: ["configuration"],
  },
  {
    slug: "ai-providers",
    group: "admin",
    title: "AI providers",
    summary: "Choose the AI model behind enrichment, translation and the assistant, and where it runs.",
    page: "/admin/ai-providers",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Administration › AI Providers sets which model Bayanis uses: a managed API, a cloud model hosted in your region, or a self-hosted open-weights model inside your network. Switching provider is a setting, not a code change.`,
      },
      {
        id: "privacy",
        title: "Privacy",
        body: `- External providers receive metadata (names, descriptions, types), not data values, unless you allow sample values.
- A self-hosted model keeps everything inside your environment.
- A provider allow-list and a daily token budget limit use.`,
      },
    ],
    related: ["ai-enrichment", "configuration"],
  },
];
