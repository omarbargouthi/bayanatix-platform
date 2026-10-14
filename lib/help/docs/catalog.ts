import type { HelpDoc } from "../types";

export const CATALOG_DOCS: HelpDoc[] = [
  {
    slug: "data-catalog",
    group: "catalog",
    title: "Data Catalog",
    summary: "The inventory of every source, schema, table and column, with the indicators on the catalog page and how they are calculated.",
    page: "/catalog",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `The Data Catalog lists every data asset Bayanis knows about, in four levels: **data source** (a database, file folder, API or pipeline workspace) › **schema** › **table** (or view, file, sheet, API object) › **column**. Assets are added by crawling a source (see [Data sources and crawling](/help/data-sources)) or by hand with **Add Asset**.

For each asset the catalog keeps its technical details (type, keys, row estimate, profile), its business description, its owner and stewards, classification, glossary terms, quality rules, lineage, certifications and custom properties.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- People find the right data quickly, with a description and an owner they can ask.
- Critical and personal data is visible, so it can be protected and its quality measured.
- Changes found by re-crawling are reviewed, so the catalog stays true to the systems.
- The catalog is the base for every other feature: privacy, sharing, quality, lineage and reports all point at catalog assets.`,
      },
      {
        id: "indicators",
        title: "Indicators on the catalog page",
        body: `All indicators count **active** columns in **active** tables only, and follow the source filter at the top of the page.

A column is either **business** (it holds business information, such as a customer name) or **technical** (keys, audit stamps, load dates). The split is suggested by Bayanis and confirmed by stewards on the Classification page. A **critical data element (CDE)** is a business column whose classification term is **Confidential, Secret or Top Secret**.

### CDEs Coverage
The share of business columns that are CDEs.

**CDE columns ÷ business columns × 100.** Technical columns are not counted. Example: 120 CDEs among 800 business columns gives 15%.

### Data Classification
The share of business columns that have a classification term.

**Classified business columns ÷ all business columns × 100.** The bar under the figure splits the classified columns by classification level (for example Public, Internal, Confidential), from the lowest level to the highest.

### Metadata Quality (CDEs)
Three measures, each a share of all CDEs:
- **Completeness:** CDEs that have a description.
- **Accuracy:** CDEs certified for their data (a certification of the **Data** kind, meaning someone checked the values, not only the documentation).
- **Consistency:** CDEs linked to a glossary term for enrichment, so their meaning comes from the shared glossary.

The **score** in the circle is the average of the three.

### Data Quality (CDEs)
How well the CDE columns pass their data quality rules.
- Each **dimension** (such as Completeness, Validity, Freshness) scores the average latest result of the active rules on CDE columns in that dimension.
- The **score** is the weighted average of the enabled dimensions that have at least one scored rule. Weights are set with **Configure** (people who can edit metadata).
- A dimension without rules is left out rather than counted as 0, so it does not pull the score down. "No rules yet" means no rule on a CDE has run in that dimension.

### Sources, Tables, Schemas
The number of data sources, active tables and schemas in the catalog (or in the sources selected in the filter).`,
      },
      {
        id: "table-indicators",
        title: "Indicators on a table's page",
        body: `### Table Health (Schema tab)
- **Overall quality score** (the circle): the average of the table's dimension scores shown under Data Quality. Each dimension scores the average latest result of the **active** rules on the table and its columns. Dimensions without a scored rule are left out.
- **CDEs:** columns of this table whose classification term is Confidential, Secret or Top Secret.
- **Metadata completion:** columns with a description ÷ all columns × 100.
- **Column type classification:** columns marked business or technical ÷ all columns × 100. Columns confirmed by a steward or accepted automatically count; suggestions still waiting for review do not.

### Data Quality (Schema tab)
One tile per dimension: Completeness, Validity, Uniqueness, Freshness, Consistency and Accuracy. A tile's score is the average latest result of the active rules in that dimension, on the table and its columns. "Not run yet" means the dimension has rules that have not run; "No rules" means it has none.

### Data Quality tab
- **DQ score:** the average latest score of all the table's rules, table-level and column-level, that ran without an error, whether or not they are switched on. The arrow compares with the rules' previous run. Green from 90%, amber from 70%, red below.
- **Passing, Warnings, Failing:** rules by their latest result, judged against each rule's thresholds (see [Data Quality](/help/data-quality)). Rules whose last run ended in an error are counted separately.
- **Charts:** rules per dimension, rules by severity, average score per dimension, and the latest results per dimension.

> The DQ score on this tab averages every rule, while the overall quality score on the Schema tab averages the dimensions and counts only active rules, so the two can differ.

### Data profile
Taken during the crawl from the rows set in the source's profiling options (PostgreSQL and file sources).
- **Total rows**, with the change since the previous profile, and **Sampled** when not every row was read.
- **Null %:** empty values among the rows read.
- **Unique %:** distinct values ÷ rows read × 100.
- **Distinct, Min, Max, Top values:** from the same rows. They are not kept for personal-data columns.

Dimension names are the ones set in Configuration › DQ Dimensions, and are the same on every screen.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Catalog › Data Assets**. Use **Filter** to limit the page to some sources; every indicator follows the filter.
2. In the **Data Assets** list, open a source to see its schemas, then a schema to see its tables. The list scrolls on its own, so the page stays the same length.
3. Open a table to see its tabs:
   - **Schema:** description (with AI suggestions), columns, keys, profile, owner and stewards, trust score.
   - **Data Quality:** the table's rules, results and suggested rules.
   - **Activity:** every change, by people and by the crawler.
   - **Lineage:** where the data comes from and where it goes.
   - **Relationships:** a map of everything linked to the table.
   - **Sample Data:** a few live rows, with personal data masked.
   - **Custom Properties:** fields your organisation added.
4. Use **Follow** on a table to see its activity on your Homepage.
5. Use **Certify** when you have checked a table's documentation (Metadata) or its values (Data).`,
      },
      {
        id: "notes",
        title: "Good to know",
        body: `- Live sample data and data quality rules run against **PostgreSQL** sources today. See [Connector coverage](/help/connectors).
- Personal-data columns are masked in sample data. Seeing them in clear needs an approved **PI clear-text access** request that states a legal basis.
- Bayanis never writes to your source systems.`,
      },
    ],
    related: ["business-glossary", "classification", "data-quality", "connectors"],
  },
  {
    slug: "business-glossary",
    group: "catalog",
    title: "Business Glossary",
    summary: "Agreed business definitions, organised by domain and linked to the columns that hold them.",
    page: "/glossary",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `The glossary holds your organisation's business vocabulary: **domains** (for example Customer, Finance), optional **sub-domains**, and **terms** with their definition, business rules, owner and steward.

Terms are linked to catalog columns in two ways:
- a **classification** term says how sensitive a column is (for example Confidential);
- an **enrichment** term gives a column its business meaning (for example "Customer national ID").`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Everyone uses the same definition for the same concept, in reports and in systems.
- One definition documents every column that holds the concept, instead of each column being described separately.
- Domains give business ownership: a domain's owner and steward are inherited by its terms.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Catalog › Glossaries** and choose a domain.
2. Add terms with **New Term**, or from the catalog page.
3. On a term, write the definition and business rules, and link the columns that hold it.
4. Set the owner and steward on the domain; terms and sub-domains inherit them. Changing them at the top of a domain applies directly; overriding them lower down needs approval.`,
      },
      {
        id: "indicators",
        title: "Indicators",
        body: `On the catalog page's Glossaries list:
- **Terms:** all terms in all domains (sub-domains are folders and are not counted).
- **Categories:** the number of top-level domains.
- **Linked terms:** terms linked to at least one catalog asset.
- **Linked assets:** catalog assets linked to at least one term.`,
      },
    ],
    related: ["data-catalog", "classification"],
  },
  {
    slug: "data-lineage",
    group: "catalog",
    title: "Data Lineage",
    summary: "How data moves between systems: the lineage graph, the mapping register, propagation and stitching review.",
    page: "/lineage",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Lineage shows where data comes from and where it goes, at table and column level, across systems. It has three views:
- **Lineage graph:** pick an asset and see what feeds it (upstream) and what it feeds (downstream), as a graph or a table.
- **Mapping asset:** the register of every lineage link, scanned or added by hand, with search, filters, Excel import and export, and stitching review.
- **Propagation:** classification that flows from a column to every copy of it downstream.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- **Impact analysis:** before changing or dropping a column, see every report and table that depends on it, and ask their owners.
- **Root cause:** trace a wrong figure back to its source.
- **Privacy:** personal data stays classified in every copy, because classification follows lineage.
- **Regulatory evidence:** show how a reported figure is produced.`,
      },
      {
        id: "sources",
        title: "Where lineage comes from",
        body: `| Source | How |
|---|---|
| PostgreSQL views, materialized views, functions and procedures | Scanned from their SQL during the crawl |
| SQL Server, MySQL and Oracle views | The view's SQL is captured and explained in **View anatomy** (tables read, joins, filters, column origins). It is not yet drawn as lineage links. |
| SSIS packages (.dtsx) | Uploaded file |
| Power BI (.pbix files or a folder of them) | Uploaded file or a Power BI Desktop Folder source |
| Azure Data Factory, Azure Synapse | A pipeline source: Git folder or the live service |
| Anything else | Added by hand on the graph or the register, or imported from Excel |

Links that point to a system not yet in the catalog become placeholders and wait in **Stitching review**, where you bind them to the right asset. Bayanis never guesses silently. See [Connector coverage](/help/connectors) for details.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **Data Catalog › Data Lineage**. On **Lineage graph**, search for a table or column.
2. Set the depth upstream and downstream, and switch between table and column level.
3. **Assess change** lists every downstream asset affected by a change, and can ask their owners to review.
4. On **Mapping asset**, search all links, add a mapping, **Export to Excel**, **Import from Excel**, or open **Stitching review**.
5. Links added by hand go through review before they count, when a lineage workflow is set up.`,
      },
    ],
    related: ["data-catalog", "connectors", "classification"],
  },
  {
    slug: "custom-assets",
    group: "catalog",
    title: "Custom assets and custom attributes",
    summary: "Add your own asset types (such as Customer or Processing Activity) and your own fields on existing assets.",
    page: "/assets",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Two ways to extend the catalog:
- **Custom asset types:** new kinds of assets with their own fields, for example *Customer*, *Business Application* or *Processing Activity*. They can be linked to each other and to catalog sources, schemas, tables and columns through **relationship types**.
- **Custom attributes:** extra fields on the existing assets (source, schema, table, column, glossary term), for example "Retention owner" or "Golden source".

Field types: text, long text, number, date, yes/no, list of values, user and link.`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Record what your organisation needs without waiting for a product change.
- Keep a **record of processing activities** (RoPA) next to the data it uses: the RoPA-lite template's Activity type requires a purpose and a legal basis.
- Show who consumes which data, or which roles can see which personal data, with the ready-made templates.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Administrators define types in Administration › Custom Asset Types, or install a template (B2B Consumption, PI Access Map, RoPA-lite).
2. Everyone with edit rights adds records under **Custom Assets** in the menu.
3. Custom attributes are defined in Administration › Configuration › Custom Attributes and filled in on each asset (for a table, on its **Custom Properties** tab).
4. Names of types and fields are translated in Languages & Translations.`,
      },
    ],
    related: ["data-catalog", "impact-assessments"],
  },
  {
    slug: "ai-enrichment",
    group: "catalog",
    title: "AI Enrichment",
    summary: "Suggested descriptions, data quality rules and business or technical column types, reviewed by a person before they apply.",
    page: "/enrichment",
    sections: [
      {
        id: "what",
        title: "What it is",
        body: `Bayanis suggests metadata so stewards don't have to write everything by hand. Nothing is applied until a person accepts it.
- **Descriptions:** suggested or rephrased descriptions for tables and columns, with the reasoning.
- **Data quality rules:** rules suggested from profiling (no AI needed: not null, uniqueness, ranges, formats, allowed values, row count trend), plus AI-suggested business rules for business columns.
- **Column types:** whether each column is business or technical, suggested from names, keys, types and glossary links (on the Classification page).`,
      },
      {
        id: "value",
        title: "Business value",
        body: `- Documents a large catalog in days instead of months.
- Stewards stay in control: they accept, edit or discard each suggestion.
- Suggested quality rules give a fast start on data quality monitoring.`,
      },
      {
        id: "how",
        title: "How to use it",
        body: `1. Open **AI Enrichment**. Start a job for a source or schema, or use **Suggest** on a single table or column.
2. Review each suggestion: accept, edit then accept, or discard.
3. Suggested AI rules start inactive; switch them on once reviewed.`,
      },
      {
        id: "privacy",
        title: "Privacy",
        body: `Which AI model is used is chosen in Administration › AI Providers: a managed API, a cloud model hosted in your region, or a self-hosted model inside your network. External providers receive no sample values by default. A daily token budget limits use.`,
      },
    ],
    related: ["ai-providers", "data-quality"],
  },
];
