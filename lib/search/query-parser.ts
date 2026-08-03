// Unified Search — query string parser (spec FR-3.2/3.3).
// Splits a raw query into field operators (name:, tag:, owner:, type:, classification:),
// quoted phrases, and remaining free-text terms.

export type ParsedQuery = {
  freeText: string;             // remaining terms, space-joined — used for ILIKE '%...%'
  operators: {
    name?: string;
    tag?: string;
    owner?: string;
    type?: string[];
    classification?: string;
  };
};

const OPERATOR_RE = /\b(name|tag|owner|type|classification):("([^"]*)"|(\S+))/gi;
const PHRASE_RE = /"([^"]+)"/g;

export function parseQuery(raw: string): ParsedQuery {
  const operators: ParsedQuery["operators"] = {};
  let remaining = raw;

  remaining = remaining.replace(OPERATOR_RE, (_match, key: string, _full: string, quoted: string, bare: string) => {
    const value = (quoted ?? bare ?? "").trim();
    const k = key.toLowerCase();
    if (!value) return "";
    if (k === "type") {
      operators.type = value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (k === "name") {
      operators.name = value;
    } else if (k === "tag") {
      operators.tag = value;
    } else if (k === "owner") {
      operators.owner = value;
    } else if (k === "classification") {
      operators.classification = value.toUpperCase();
    }
    return "";
  });

  // Remaining quoted phrases (not part of an operator) count as literal free-text substrings.
  const phrases: string[] = [];
  remaining = remaining.replace(PHRASE_RE, (_m, p: string) => { phrases.push(p); return ""; });

  const words = remaining.split(/\s+/).map((w) => w.trim()).filter(Boolean);
  const freeText = [...phrases, ...words].join(" ").trim();

  return { freeText, operators };
}
