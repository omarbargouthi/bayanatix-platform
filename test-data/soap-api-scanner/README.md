# SOAP API (WSDL) scanner test fixture

Register a `SOAP_API` source (Admin > Data Sources) with the path/URL pointing at
`customer-service.wsdl` in this folder, then crawl it. The WSDL is only read, never
called live.

Expected result — schema `customerservice`, 2 tables:

| Table | Column | Data type | Nullable |
|---|---|---|---|
| `Customer` | customerId | integer | no (minOccurs=1) |
| | fullName | text | no (minOccurs=1) |
| | email | text | yes |
| | createdAt | date | yes |
| | creditLimit | numeric | yes |
| | isActive | boolean | no (minOccurs=1) |
| | phoneNumbers | json (maxOccurs=unbounded) | yes |
| `Order` | orderId | text | no (minOccurs=1) |
| | customerId | integer | no (minOccurs=1) |
| | amount | numeric | no (minOccurs=1) |
| | placedOn | date | yes |
