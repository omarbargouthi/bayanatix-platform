// Reads a regulation's registration fields from a request body (the same form creates
// and edits a regulation). Only the keys present in the body are returned, so an edit
// that sends a few fields leaves the others untouched.
import type { RegulationDetailsPatch } from "./queries/gov-compliance";

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};
const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u);

export function parseRegulationInput(body: Record<string, unknown>): { patch: RegulationDetailsPatch } | { error: string } {
  const patch: RegulationDetailsPatch = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has("name")) patch.name = text(body.name, 200) ?? "";
  if (has("version")) patch.version = text(body.version, 50);
  if (has("description")) patch.description = text(body.description, 4000);
  if (has("assessmentMode")) {
    if (body.assessmentMode !== "COMPLIANCE_ONLY" && body.assessmentMode !== "MATURITY") return { error: "assessmentMode must be COMPLIANCE_ONLY or MATURITY" };
    patch.assessmentMode = body.assessmentMode;
  }
  if (has("regionName")) patch.regionName = text(body.regionName, 100);
  if (has("countriesInScope")) patch.countriesInScope = text(body.countriesInScope, 1000);
  if (has("scopeNote")) patch.scopeNote = text(body.scopeNote, 2000);
  if (has("regulatoryBody")) patch.regulatoryBody = text(body.regulatoryBody, 500);
  if (has("effectiveDateNote")) patch.effectiveDateNote = text(body.effectiveDateNote, 1000);
  if (has("effectiveDate")) {
    const d = text(body.effectiveDate, 10);
    if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) return { error: "The effective date must be a date (YYYY-MM-DD)." };
    patch.effectiveDate = d;
  }
  if (has("officialUrl")) {
    const u = text(body.officialUrl, 1000);
    if (u && !isHttpUrl(u)) return { error: "The official link must start with http:// or https://" };
    patch.officialUrl = u;
  }
  if (has("referenceLinks")) {
    const links: { label: string; url: string }[] = [];
    for (const raw of Array.isArray(body.referenceLinks) ? body.referenceLinks.slice(0, 20) : []) {
      const url = text((raw as { url?: unknown })?.url, 1000);
      if (!url) continue;
      if (!isHttpUrl(url)) return { error: "Every reference link must start with http:// or https://" };
      links.push({ label: text((raw as { label?: unknown })?.label, 200) ?? "", url });
    }
    patch.referenceLinks = links;
  }
  return { patch };
}
