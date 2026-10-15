// A breach as a printable report in the reader's language, laid out around what a
// regulator notification asks for (PDPL Implementing Regulation art. 24, GDPR art. 33(3)):
// what happened and when, the data and people concerned, the likely consequences, the
// measures taken, who to contact, and the notifications made. Times are in UTC so the
// report reads the same everywhere. Rendered to PDF by lib/reports/pdf-render.
import type { I18nStrings } from "../i18n/strings";
import { assetTypeLabel, factLines, fill } from "./dpia-text";
import { formatSpan, type BreachDetail } from "./breach-types";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const utc = (iso: string | null | undefined) => (iso ? `⁦${iso.slice(0, 16).replace("T", " ")} UTC⁩` : null);

export function buildBreachHtml(br: BreachDetail, t: I18nStrings, lang: string, contact: { name: string; email: string | null } | null): string {
  const b = t.breach;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const start = dir === "rtl" ? "right" : "left";
  const none = `<span class="muted">${esc(b.exportNotProvided)}</span>`;
  const para = (v: string | null | undefined) => (v ? esc(v).replace(/\n/g, "<br/>") : none);
  const val = (v: string | number | null | undefined) => (v == null || v === "" ? none : esc(typeof v === "number" ? v.toLocaleString("en-US") : v));
  const row = (label: string, value: string) => `<tr><th>${esc(label)}</th><td>${value}</td></tr>`;
  const section = (title: string, body: string) => `<h2>${esc(title)}</h2>${body}`;
  const list = (lines: string[]) => (lines.length ? `<ul>${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="muted">${esc(t.dpia.facts.none)}</p>`);
  const join = (codes: string[], labels: Record<string, string>) => (codes.length ? esc(codes.map((c) => labels[c] ?? c).join(" · ")) : none);

  const summary = `<table class="kv">
    ${row(b.colStatus, esc(b.statuses[br.statusCode]))}
    ${row(b.fRegulations, join(br.regulations, b.regulations))}
    ${row(b.fDiscoveredAt, val(utc(br.discoveredAt)))}
    ${row(`${b.fOccurredFrom} / ${b.fOccurredTo}`, `${val(utc(br.occurredFrom))} — ${val(utc(br.occurredTo))}`)}
    ${row(b.exportDeadline, esc(utc(br.authorityDeadline)))}
    ${row(b.fOwner, contact ? `<bdi>${esc(contact.name)}</bdi>${contact.email ? ` · <bdi dir="ltr">${esc(contact.email)}</bdi>` : ""}` : none)}
    ${row(b.exportReporter, esc(br.reportedByName ?? br.reportedByUserId))}
  </table>`;

  const what = `<table class="kv">
    ${row(b.fDescription, para(br.description))}
    ${row(b.fHowDiscovered, para(br.howDiscovered))}
    ${row(b.fTypes, join(br.breachTypes, b.types))}
    ${row(b.fCause, br.causeCode ? esc(b.causes[br.causeCode]) : none)}
  </table>`;

  const assets = `<table><thead><tr><th>${esc(b.exportAsset)}</th><th>${esc(b.exportKind)}</th></tr></thead><tbody>
    ${br.assets.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(assetTypeLabel(t, a.typeCode, a.typeName, lang, a.typeNameTranslations))}${a.sublabel ? ` · ${esc(a.sublabel)}` : ""}</td></tr>`).join("") || `<tr><td colspan="2" class="muted">${esc(b.noAssets)}</td></tr>`}
  </tbody></table>`;
  const data = `${assets}
    <table class="kv">${row(b.fSubjects, val(br.subjectsEstimate))}${row(b.fRecords, val(br.recordsEstimate))}</table>
    ${br.facts ? `<h3>${esc(b.blockPersonal)}</h3>${list(factLines(t, br.facts, "PERSONAL_DATA"))}
      <h3>${esc(b.blockScale)}</h3>${list(factLines(t, br.facts, "SCALE"))}
      <h3>${esc(b.blockFlows)}</h3>${list(factLines(t, br.facts, "FLOWS"))}
      <h3>${esc(b.blockRecipients)}</h3>${list(factLines(t, br.facts, "RECIPIENTS"))}` : ""}`;

  const risk = `<table class="kv">
    ${row(b.fRisk, br.riskLevel ? esc(b.risks[br.riskLevel]) : esc(b.notAssessed))}
    ${row(b.fRiskReason, para(br.riskReason))}
    ${row(b.fConsequences, para(br.consequences))}
  </table>`;

  const measures = `<table class="kv">
    ${row(b.fContainment, para(br.containment))}
    ${br.containedAt ? row(b.statuses.CONTAINED, esc(utc(br.containedAt))) : ""}
    ${row(b.fPrevention, para(br.prevention))}
  </table>`;

  const notifications = `<h3>${esc(b.authTitle)}</h3><table class="kv">
    ${row(b.colStatus, esc(fill(b.authorityStates[br.authorityState], { time: formatSpan(new Date(br.authorityDeadline).getTime() - Date.now(), b.hoursN, b.daysHours) })))}
    ${row(b.fAuthorityName, val(br.authorityName))}
    ${row(b.fAuthorityAt, val(utc(br.authorityNotifiedAt)))}
    ${row(b.fAuthorityRef, val(br.authorityReference))}
    ${br.authorityLateReason ? row(b.fLateReason, para(br.authorityLateReason)) : ""}
  </table>
  <h3>${esc(b.subjTitle)}</h3><table class="kv">
    ${row(b.colSubjects, esc(b.subjectsStates[br.subjectsState]))}
    ${row(b.fSubjectsAt, val(utc(br.subjectsNotifiedAt)))}
    ${row(b.fSubjectsMethod, val(br.subjectsMethod))}
    ${row(b.fSubjectsCount, val(br.subjectsNotified))}
    ${br.subjectsExemption ? row(b.fExemption, para(br.subjectsExemption)) : ""}
  </table>`;

  const timeline = `<table><tbody>${br.events.map((e) => `<tr><td style="width:150px">${esc(utc(e.at))}</td><td>${esc((b.events as Record<string, string>)[e.code] ?? e.code)}${e.note ? ` — ${esc(e.code === "RISK" ? (b.riskShort as Record<string, string>)[e.note] ?? e.note : e.note)}` : ""}</td><td class="muted">${esc(e.user ?? b.system)}</td></tr>`).join("")}</tbody></table>`;

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
  table.kv th { width: 190px; color: #5b6390; font-weight: 600; }
  ul { margin: 2px 0; padding-${start}: 16px; } li { margin: 1px 0; }
  .muted { color: #8089b3; }
</style></head>
<body>
  <div class="header">
    <div><div class="brand">BAYANIS</div><div class="title">${esc(br.referenceCode)} — ${esc(br.title)}</div><div class="muted">${esc(b.exportTitle)}</div></div>
    <div class="meta"><div>${esc(fill(b.exportGenerated, { date: utc(new Date().toISOString()) ?? "" }))}</div></div>
  </div>
  ${section(b.exportSummary, summary)}
  ${section(b.secWhat, what)}
  ${section(b.secData, data)}
  ${section(b.secRisk, risk)}
  ${section(b.secMeasures, measures)}
  ${section(b.secNotify, notifications)}
  ${section(b.secTimeline, timeline)}
</body></html>`;
}
