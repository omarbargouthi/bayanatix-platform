// An impact assessment as a printable document, in the reader's language: what it is
// about, the catalog facts it was assessed on, the answers, the risks and measures, and
// the decision. Rendered to PDF by lib/reports/pdf-render.
import type { I18nStrings } from "../i18n/strings";
import { pickTranslation } from "../i18n-admin/translated-column";
import { FACT_BLOCKS, assetTypeLabel, day, factLines, fill, flagText } from "./dpia-text";
import { inherentLevel, residualLevel, overallInherent, overallResidual, screeningRecommendation, type DpiaDetail, type RiskLevel } from "./dpia-types";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const para = (v: string | null | undefined, empty: string) => (v ? esc(v).replace(/\n/g, "<br/>") : `<span class="muted">${esc(empty)}</span>`);
const LEVEL_HEX: Record<RiskLevel, string> = { LOW: "#059669", MEDIUM: "#b45309", HIGH: "#dc2626" };

export function buildDpiaHtml(dpia: DpiaDetail, t: I18nStrings, lang: string, frozenVersion: number | null): string {
  const d = t.dpia;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const start = dir === "rtl" ? "right" : "left";
  const tr = (base: string | null, map: Record<string, string> | null) => pickTranslation(base, map, lang);
  const level = (l: RiskLevel | null) => (l ? `<span class="pill" style="color:${LEVEL_HEX[l]};border-color:${LEVEL_HEX[l]}">${esc(d.levels[l])}</span>` : "—");
  const row = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
  const section = (title: string, body: string) => `<h2>${esc(title)}</h2>${body}`;
  const list = (lines: string[]) => (lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="muted">${esc(d.facts.none)}</p>`);

  const rec = screeningRecommendation(dpia.questions, dpia.template.threshold);
  const screening = dpia.questions.filter((q) => q.stage === "SCREENING");
  const assessment = dpia.questions.filter((q) => q.stage === "ASSESSMENT");
  const assessed = dpia.statusCode !== "SCREENING" && dpia.statusCode !== "NOT_REQUIRED";

  const summary = `<table class="kv">
    ${row(d.colStatus, esc(d.statuses[dpia.statusCode]) + (frozenVersion ? ` — ${esc(fill(d.versionN, { n: frozenVersion }))}` : ""))}
    ${row(d.fTemplate, esc(tr(dpia.template.name, dpia.template.nameTranslations)) + `<div class="muted">${esc(tr(dpia.template.regulation, dpia.template.regulationTranslations))}</div>`)}
    ${row(d.colSubject, dpia.subject ? `${esc(dpia.subject.name)} <span class="muted">(${esc(assetTypeLabel(t, dpia.subject.typeCode, dpia.subject.typeName, lang, dpia.subject.typeNameTranslations))})</span>` : "—")}
    ${row(d.colOwner, esc(dpia.ownerName ?? "—"))}
    ${row(d.colRisk, `${esc(d.inherent)} ${level(overallInherent(dpia.risks))} &nbsp; ${esc(d.residual)} ${level(overallResidual(dpia.risks))}`)}
    ${row(d.colDecided, `${esc(dpia.decidedBy ?? "—")} · ${esc(day(dpia.decidedAt))}`)}
    ${row(d.colNextReview, esc(day(dpia.nextReviewDate)))}
  </table>${dpia.description ? `<p>${para(dpia.description, "")}</p>` : ""}`;

  const scope = `<table><thead><tr><th>${esc(d.exportAsset)}</th><th>${esc(d.exportKind)}</th></tr></thead><tbody>
    ${dpia.assets.map((a) => `<tr><td>${esc(a.name)}${a.isSubject ? ` <span class="muted">(${esc(d.subjectTag)})</span>` : ""}</td><td>${esc(assetTypeLabel(t, a.typeCode, a.typeName, lang, a.typeNameTranslations))}${a.sublabel ? ` · ${esc(a.sublabel)}` : ""}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">${esc(d.noAssets)}</td></tr>`}
  </tbody></table>`;

  const facts = dpia.facts;
  const findings = facts && facts.flags.length ? list(facts.flags.map((f) => flagText(t, f))) : `<p class="muted">${esc(d.noFindings)}</p>`;
  const factBlocks = FACT_BLOCKS.map((b) => ({ b, lines: factLines(t, facts, b) })).filter((x) => x.lines.length)
    .map((x) => `<h3>${esc(d.facts.blocks[x.b])}</h3>${list(x.lines)}`).join("");

  const screeningBody = `<table><thead><tr><th>${esc(d.exportQuestion)}</th><th style="width:70px">${esc(d.exportAnswer)}</th></tr></thead><tbody>
    ${screening.map((q) => `<tr><td>${esc(tr(q.text, q.textTranslations))}</td><td>${q.answerCode ? esc(q.answerCode === "YES" ? d.yes : d.no) : "—"}</td></tr>`).join("")}
  </tbody></table>
  <p>${esc(fill(d.screeningCount, { yes: rec.yes, answered: rec.answered, total: rec.total }))}
  ${dpia.screeningOutcome ? esc(fill(dpia.screeningOutcome === "REQUIRED" ? d.outcomeRequired : d.outcomeNotRequired, { by: dpia.screeningBy ?? "—", date: day(dpia.screeningAt) })) : ""}</p>
  ${dpia.screeningNote ? `<p>${para(dpia.screeningNote, "")}</p>` : ""}`;

  const answers = (["DESCRIPTION", "NECESSITY", "CONSULTATION"] as const).map((s) => {
    const qs = assessment.filter((q) => q.section === s);
    return qs.length ? `<h3>${esc(d.sections[s])}</h3>${qs.map((q) => `<div class="qa"><div class="q">${esc(tr(q.text, q.textTranslations))}</div><div>${para(q.answerText, d.noAnswer)}</div></div>`).join("")}` : "";
  }).join("");

  const risks = dpia.risks.length === 0 ? `<p class="muted">${esc(d.noRisks)}</p>` : dpia.risks.map((r) => {
    const ms = dpia.measures.filter((m) => m.riskId === r.riskId);
    return `<div class="risk"><div class="q">${esc(r.title)} &nbsp; ${esc(d.inherent)} ${level(inherentLevel(r))} &nbsp; ${esc(d.residual)} ${r.residualLikelihood ? level(residualLevel(r)) : esc(d.notScored)}</div>
      ${r.description ? `<div>${para(r.description, "")}</div>` : ""}${measureTable(ms)}</div>`;
  }).join("");
  function measureTable(ms: DpiaDetail["measures"]): string {
    if (ms.length === 0) return `<p class="muted">${esc(d.noMeasures)}</p>`;
    return `<table><thead><tr><th>${esc(d.measures)}</th><th>${esc(d.measureOwner)}</th><th>${esc(d.measureDue)}</th><th>${esc(d.measureStatus)}</th></tr></thead><tbody>
      ${ms.map((m) => `<tr><td>${esc(m.text)}${m.note ? `<div class="muted">${esc(m.note)}</div>` : ""}</td><td>${esc(m.ownerName ?? d.noOwner)}</td><td>${esc(day(m.dueDate))}</td><td>${esc(d.measureStatuses[m.status])}</td></tr>`).join("")}
    </tbody></table>`;
  }
  const loose = dpia.measures.filter((m) => m.riskId == null || !dpia.risks.some((r) => r.riskId === m.riskId));

  const decision = dpia.statusCode === "NOT_REQUIRED"
    ? `<table class="kv">${row(d.justification, para(dpia.screeningNote, "—"))}</table>`
    : `<table class="kv">
        ${row(d.decision, esc(d.statuses[dpia.statusCode]))}
        ${row(d.opinion, para(dpia.dpoOpinion, "—"))}
        ${dpia.conditions ? row(d.conditions, para(dpia.conditions, "—")) : ""}
        ${row(d.consultation, esc(d.consultations[dpia.consultationCode]) + (dpia.consultationNote ? ` — ${esc(dpia.consultationNote)}` : ""))}
      </table>`;

  return `<!doctype html>
<html dir="${dir}" lang="${esc(lang)}">
<head><meta charset="utf-8" />
<style>
  * { box-sizing: border-box; }
  body { font-family: ${lang === "ar" ? "'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif" : "'Inter', 'Segoe UI', Arial, sans-serif"}; margin: 0; padding: 28px; color: #0f1238; font-size: 11px; line-height: 1.5; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e6e9f5; padding-bottom: 12px; margin-bottom: 8px; }
  .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.16em; color: #201C55; }
  .title { font-size: 19px; font-weight: 800; color: #201C55; margin-top: 4px; }
  .meta { font-size: 10px; color: #8089b3; text-align: ${dir === "rtl" ? "left" : "right"}; line-height: 1.6; }
  h2 { font-size: 13px; color: #201C55; margin: 20px 0 6px; border-bottom: 1px solid #e6e9f5; padding-bottom: 3px; }
  h3 { font-size: 11px; color: #0f1238; margin: 12px 0 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; margin: 4px 0; }
  th, td { text-align: ${start}; padding: 5px 8px; border-bottom: 1px solid #eef0f8; vertical-align: top; }
  thead th { color: #8089b3; text-transform: uppercase; font-size: 9px; letter-spacing: 0.05em; }
  table.kv th { width: 170px; color: #5b6390; font-weight: 600; }
  ul { margin: 2px 0; padding-${start}: 16px; } li { margin: 1px 0; }
  .muted { color: #8089b3; }
  .pill { display: inline-block; border: 1px solid; border-radius: 10px; padding: 0 7px; font-size: 9.5px; font-weight: 700; }
  .qa, .risk { margin: 8px 0; page-break-inside: avoid; } .q { font-weight: 700; margin-bottom: 2px; }
</style></head>
<body>
  <div class="header">
    <div><div class="brand">BAYANIS</div><div class="title">${esc(dpia.referenceCode)} — ${esc(dpia.title)}</div><div class="muted">${esc(d.exportHeading)}</div></div>
    <div class="meta"><div>${esc(d.exportGenerated)}: ${new Date().toISOString().slice(0, 16).replace("T", " ")}</div>
      ${frozenVersion ? `<div>${esc(fill(d.frozenBanner, { n: frozenVersion, date: day(dpia.decidedAt) }))}</div>` : `<div>${esc(d.exportCurrent)}</div>`}</div>
  </div>
  ${section(d.exportSummary, summary)}
  ${section(d.scopeTitle, scope)}
  ${section(d.findingsTitle, findings + factBlocks)}
  ${section(d.screeningTitle, screeningBody)}
  ${assessed ? section(d.tabs.assessment, answers) : ""}
  ${assessed ? section(d.risksTitle, risks + (loose.length ? `<h3>${esc(d.generalMeasures)}</h3>${measureTable(loose)}` : "")) : ""}
  ${dpia.decidedAt ? section(d.decisionTitle, decision) : ""}
</body></html>`;
}
