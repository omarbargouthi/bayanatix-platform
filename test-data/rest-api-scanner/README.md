# REST API (OpenAPI) scanner test fixture

Register a `REST_API` source (Admin > Data Sources) with the path/URL pointing at
`petstore.openapi.yaml` in this folder, then crawl it. The spec is only read, never
called live.

Expected result — schema `petstore_demo_api`, 2 tables:

| Table | Column | Data type | Nullable |
|---|---|---|---|
| `Pet` | id | integer | no (required) |
| | name | text | no (required) |
| | status | text | yes |
| | adopted_at | date | yes |
| | weight_kg | numeric | yes |
| | vaccinated | boolean | yes |
| | tags | json (array) | yes |
| | owner | json ($ref) | yes |
| `Owner` | owner_id | integer | no (required) |
| | full_name | text | yes |
| | email | text | yes |
| | signup_date | date | yes |
