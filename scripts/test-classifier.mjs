import { classifyColumn } from "../lib/column-classifier.ts";

const G = {
  SURROGATE_KEY: [/_id$/, /^id$/, /_key$/, /_sk$/, /_seq$/, /_uid$/, /guid/, /uuid/],
  AUDIT_COLUMN: [/^created_/, /^updated_/, /^modified_/, /_timestamp$/, /^row_version/, /^is_deleted/, /^deleted_/, /^etl_/, /^batch_/, /^load_/, /^src_sys/, /^tenant_id$/, /^hash_/, /^rec_status/],
  NATURAL_ID: [/_no$/, /_num$/, /_number$/, /_code$/, /_ref$/, /iban/, /vat_no/, /national_id/],
  LOOKUP_VALUE: [/_name$/, /_desc$/, /_description$/, /_label$/, /_value$/, /_text$/, /name_(en|ar)$/],
};

function col(name, overrides = {}) {
  return {
    name, dataType: "text", defaultValueText: null,
    isPrimaryKey: false, isForeignKey: false,
    entity: { categoryCode: "MASTER", pkColumnCount: 1, referencedByMasterOrTransactional: false },
    referencedColumn: null, hasGlossaryMatch: false, hasGovernanceSignals: false,
    ...overrides,
  };
}

function check(label, input, expectedClass, expectedRule) {
  const r = classifyColumn(input, G);
  const ok = r.suggestedClass === expectedClass && (!expectedRule || r.rationale.terminal_rule === expectedRule);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: got ${r.suggestedClass}/${r.rationale.terminal_rule} conf=${r.confidence} band=${r.band} (expected ${expectedClass}${expectedRule ? "/" + expectedRule : ""})`);
  if (!ok) console.log("      hits:", JSON.stringify(r.rationale.hits));
}

console.log("=== Criteria 1: customers (MASTER) ===");
const masterEntity = { categoryCode: "MASTER", pkColumnCount: 1, referencedByMasterOrTransactional: false };
check("customer_id (serial PK)", col("customer_id", { isPrimaryKey: true, dataType: "integer", defaultValueText: "nextval('x')", entity: masterEntity }), "TECHNICAL", "R2");
check("customer_no", col("customer_no", { entity: masterEntity }), "BUSINESS", "R4");
check("full_name", col("full_name", { entity: masterEntity }), "BUSINESS", "R9");
check("address_line", col("address_line", { entity: masterEntity }), "BUSINESS", "R9");
check("created_at", col("created_at", { entity: masterEntity }), "TECHNICAL", "R1");
check("updated_by", col("updated_by", { entity: masterEntity }), "TECHNICAL", "R1");

console.log("\n=== Criteria 2: orders (TRANSACTIONAL) ===");
const txEntity = { categoryCode: "TRANSACTIONAL", pkColumnCount: 1, referencedByMasterOrTransactional: false };
check("order_id PK", col("order_id", { isPrimaryKey: true, dataType: "integer", defaultValueText: "nextval('x')", entity: txEntity }), "TECHNICAL", "R2");
check("customer_id FK", col("customer_id", { isForeignKey: true, entity: txEntity, referencedColumn: { isSurrogatePk: true, discoveryMethod: "INTROSPECTED" } }), "TECHNICAL", "R3");
check("order_no", col("order_no", { entity: txEntity }), "BUSINESS", "R4");
check("order_date", col("order_date", { entity: txEntity }), "BUSINESS", "R9");
check("total_amount", col("total_amount", { entity: txEntity }), "BUSINESS", "R9");
check("etl_batch_id", col("etl_batch_id", { entity: txEntity }), "TECHNICAL", "R1");

console.log("\n=== Criteria 3: countries (REFERENCE, referenced) ===");
// NOTE: spec labels country_id as "R6" and country_code as "R5", but strict priority-order
// evaluation (R2/R4 come before R5/R6) makes both match the earlier, more general rule
// instead — same DECISION (TECHNICAL / BUSINESS resp.), different rule label. Asserting
// decision only for these two, matching the spec's own "first match wins, evaluated in
// order" instruction over its illustrative rule labels.
const refReferencedEntity = { categoryCode: "REFERENCE", pkColumnCount: 1, referencedByMasterOrTransactional: true };
check("country_id PK", col("country_id", { isPrimaryKey: true, entity: refReferencedEntity }), "TECHNICAL");
check("country_code", col("country_code", { entity: refReferencedEntity }), "BUSINESS");
check("country_name_en", col("country_name_en", { entity: refReferencedEntity }), "BUSINESS", "R5");
check("country_name_ar", col("country_name_ar", { entity: refReferencedEntity }), "BUSINESS", "R5");

console.log("\n=== Criteria 4: unreferenced lookup ===");
// NOTE: spec's illustrative table said "unreferenced lookup -> ALL columns TECHNICAL,
// LOW band". Real usage (regions/segment/party_role_type tables) showed this was wrong
// for descriptive columns: REFERENCE is itself the "business-nature lookup" category
// (SETUP/SYSTEM is where genuinely internal lookups live, via R8) — missing inbound-FK
// evidence just means the topology can't *confirm* usage, it doesn't make a country
// name technical. R7 now stays BUSINESS for non-key columns regardless of referenced
// status, just at reduced (sub-HIGH) confidence so a steward still reviews it. Key
// columns (R6) are unaffected — key-ness is a real technical signal either way.
const refUnreferencedEntity = { categoryCode: "REFERENCE", pkColumnCount: 1, referencedByMasterOrTransactional: false };
check("country_id PK (unreferenced)", col("country_id", { isPrimaryKey: true, entity: refUnreferencedEntity }), "TECHNICAL");
check("country_name_en (unreferenced)", col("country_name_en", { entity: refUnreferencedEntity }), "BUSINESS", "R7");
// Referenced lookup, non-key column that doesn't match a LOOKUP_VALUE pattern (e.g.
// "applies_to" on party_role_type) — previously fell all the way to the R11 fallback
// at BUSINESS/0.40; now correctly lands on R7 at a more confident BUSINESS/0.70.
check("applies_to (referenced, no pattern match)", col("applies_to", { entity: refReferencedEntity }), "BUSINESS", "R7");

console.log("\n=== Criteria 6: glossary modifier ===");
const r6 = classifyColumn(col("natl_id", { entity: masterEntity, hasGlossaryMatch: true, glossaryTermName: "National ID" }), G);
console.log(`${r6.suggestedClass === "BUSINESS" && r6.confidence === 0.95 ? "OK  " : "FAIL"} natl_id w/ glossary: ${r6.suggestedClass} conf=${r6.confidence} (expected BUSINESS/0.95)`);

console.log("\n=== Criteria 5-ish: composite natural PK ===");
const compositeEntity = { categoryCode: "MASTER", pkColumnCount: 2, referencedByMasterOrTransactional: false };
check("region_code (composite PK member)", col("region_code", { isPrimaryKey: true, entity: compositeEntity }), "BUSINESS");

console.log("\n=== Setup/System ===");
const setupEntity = { categoryCode: "SETUP", pkColumnCount: 1, referencedByMasterOrTransactional: false };
check("tax_rate", col("tax_rate", { entity: setupEntity }), "TECHNICAL", "R8");

console.log("\n=== Null category fallback + cap ===");
const nullEntity = { categoryCode: null, pkColumnCount: 1, referencedByMasterOrTransactional: false };
const rNull = classifyColumn(col("some_field", { entity: nullEntity }), G);
console.log(`${rNull.suggestedClass === "BUSINESS" && rNull.confidence <= 0.50 ? "OK  " : "FAIL"} some_field null-category: ${rNull.suggestedClass}/${rNull.rationale.terminal_rule} conf=${rNull.confidence} (expected BUSINESS/R11, conf<=0.50)`);
