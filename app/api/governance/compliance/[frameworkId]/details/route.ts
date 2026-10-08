import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageDomain } from "@/lib/can";
import { updateRegulationDetails } from "@/lib/queries/gov-compliance";

// A regulation's registration details (db/162): region, countries in scope, regulatory
// body, effective date and official links. Same permission as marking a regulation
// applicable: managing the Governance domain.
const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};
const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u);

export async function PATCH(req: Request, { params }: { params: { frameworkId: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canManageDomain(session, "GOVERNANCE"))) return NextResponse.json({ error: "Only people who manage the Governance domain can edit regulation details." }, { status: 403 });

  const frameworkId = Number(params.frameworkId);
  if (!Number.isFinite(frameworkId)) return NextResponse.json({ error: "Invalid frameworkId" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const officialUrl = text(body.officialUrl, 1000);
  if (officialUrl && !isHttpUrl(officialUrl)) return NextResponse.json({ error: "The official link must start with http:// or https://" }, { status: 400 });

  const effectiveDate = text(body.effectiveDate, 10);
  if (effectiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return NextResponse.json({ error: "The effective date must be a date (YYYY-MM-DD)." }, { status: 400 });

  const referenceLinks: { label: string; url: string }[] = [];
  for (const raw of Array.isArray(body.referenceLinks) ? body.referenceLinks.slice(0, 20) : []) {
    const url = text((raw as { url?: unknown })?.url, 1000);
    if (!url) continue;
    if (!isHttpUrl(url)) return NextResponse.json({ error: "Every reference link must start with http:// or https://" }, { status: 400 });
    referenceLinks.push({ label: text((raw as { label?: unknown })?.label, 200) ?? "", url });
  }

  const found = await updateRegulationDetails(frameworkId, {
    regionName: text(body.regionName, 100), countriesInScope: text(body.countriesInScope, 1000), scopeNote: text(body.scopeNote, 2000),
    regulatoryBody: text(body.regulatoryBody, 500), effectiveDate, effectiveDateNote: text(body.effectiveDateNote, 1000),
    officialUrl, referenceLinks,
  }, session.userId);
  if (!found) return NextResponse.json({ error: "Regulation not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
