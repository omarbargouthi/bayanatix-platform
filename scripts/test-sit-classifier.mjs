import { scoreColumnAgainstSit } from "../lib/sit-classifier.ts";

function pat(glossaryId, patternType, patternText, confidenceWeight) {
  return { glossaryId, patternType, patternText, confidenceWeight };
}

function col(overrides = {}) {
  return { name: "", friendlyName: null, description: null, sampleValues: [], ...overrides };
}

function check(label, input, patternsByTerm, minConfidence, expectedGlossaryId, expectedBand) {
  const r = scoreColumnAgainstSit(input, patternsByTerm, minConfidence);
  const gotId = r?.glossaryId ?? null;
  const gotBand = r?.band ?? null;
  const ok = gotId === expectedGlossaryId && (!expectedBand || gotBand === expectedBand);
  console.log(`${ok ? "OK  " : "FAIL"} ${label}: got glossaryId=${gotId} band=${gotBand} conf=${r?.confidence ?? "-"} (expected glossaryId=${expectedGlossaryId}${expectedBand ? "/" + expectedBand : ""})`);
  if (!ok) console.log("      hits:", JSON.stringify(r?.hits));
}

console.log("=== National ID: VALUE_REGEX + CHECKSUM should reach HIGH ===");
const nationalIdPatterns = new Map([
  [1, [pat(1, "VALUE_REGEX", "^1\\d{9}$", 0.6), pat(1, "CHECKSUM", "SA_NATIONAL_ID", 0.9), pat(1, "NAME_REGEX", "national.?id", 0.3)]],
]);
// Values below are hand-computed to pass SA_NATIONAL_ID's check-digit algorithm
// (see lib/sit-classifier.ts), not arbitrary — so VALUE_REGEX (0.6) + CHECKSUM (0.9)
// both contribute at ratio 1.0, capped to confidence 1.0 → HIGH.
check(
  "national_id column, all check-digit-valid values",
  col({ name: "national_id", sampleValues: ["1234567897", "1000000008", "1987654322"] }),
  nationalIdPatterns, 0.5, 1, "HIGH",
);

console.log("\n=== Credit card: Luhn-valid number should score via CHECKSUM ===");
const ccPatterns = new Map([
  [2, [pat(2, "VALUE_REGEX", "^\\d{13,19}$", 0.4), pat(2, "CHECKSUM", "LUHN", 0.9)]],
]);
check(
  "credit_card column, Luhn-valid PAN",
  col({ name: "credit_card", sampleValues: ["4111111111111111"] }), // well-known Luhn-valid test PAN
  ccPatterns, 0.5, 2, "HIGH",
);

console.log("\n=== IBAN: mod-97 valid SA IBAN should score via CHECKSUM ===");
const ibanPatterns = new Map([
  [3, [pat(3, "VALUE_REGEX", "^SA\\d{22}$", 0.6), pat(3, "CHECKSUM", "IBAN_MOD97", 0.9)]],
]);
check(
  "iban column, mod-97 valid",
  col({ name: "iban", sampleValues: ["SA0380000000608010167519"] }), // well-known valid test IBAN
  ibanPatterns, 0.5, 3, "HIGH",
);

console.log("\n=== No live samples: NAME_REGEX-only degrade ===");
const nameOnlyPatterns = new Map([
  [4, [pat(4, "NAME_REGEX", "salary|wage", 0.4)]],
]);
check(
  "employee_salary column, no live connection",
  col({ name: "employee_salary", sampleValues: [] }),
  nameOnlyPatterns, 0.3, 4, "LOW",
);

console.log("\n=== Below threshold: nothing surfaces ===");
check(
  "unrelated column",
  col({ name: "notes", sampleValues: ["hello world"] }),
  nationalIdPatterns, 0.5, null,
);
