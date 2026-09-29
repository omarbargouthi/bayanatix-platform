# JSON scanner test fixtures

Register a `JSON` source (Admin > Data Sources) with the path pointing at this folder
(e.g. `C:\Omar\...\bayanatix-platform\test-data\json-scanner`), then crawl it.

Expected result — 1 schema, 4 tables:

| File | Resolution case | Table(s) | Columns |
|---|---|---|---|
| `customers.json` | top-level array of objects | `customers` | id, name, email, active, signup_date, lifetime_value, tags (json), notes (json) |
| `nested_export.json` | object with array-valued keys | `nested_export_users`, `nested_export_orders` | (export_meta is dropped — not an array field) |
| `config.json` | plain object fallback | `config` | one row, one column per top-level key; `feature_flags` and `supported_locales` typed `json` |
