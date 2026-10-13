"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { GovAnnouncement } from "@/lib/queries/gov-announcements";
import { fwSectionSlug } from "@/lib/gov-framework-sections";

// The Dashboard's announcements panel: what the Governance Framework is advertising —
// scheduled events of the Communication Plan, roadmap milestones and deliverables,
// training material, newly published policies and procedures (what qualifies:
// lib/queries/gov-announcements.ts).

const KIND_STYLE: Record<string, string> = {
  ROADMAP:         "bg-violet-50 text-violet-700 border-violet-200",
  TRAINING:        "bg-sky-50 text-sky-700 border-sky-200",
  POLICY:          "bg-emerald-50 text-emerald-700 border-emerald-200",
  PROCESS:         "bg-teal-50 text-teal-700 border-teal-200",
  STANDARD:        "bg-slate-100 text-slate-700 border-slate-200",
  STRATEGY:        "bg-indigo-50 text-indigo-700 border-indigo-200",
  OPERATING_MODEL: "bg-indigo-50 text-indigo-700 border-indigo-200",
  COMMUNICATION:   "bg-rose-50 text-rose-700 border-rose-200",
  REGULATORY:      "bg-amber-50 text-amber-800 border-amber-200",
};
// Communication Plan events take the colour of what they are about.
const EVENT_STYLE: Record<string, string> = {
  TRAINING: KIND_STYLE.TRAINING, AWARENESS: KIND_STYLE.TRAINING,
  POLICY_UPDATE: KIND_STYLE.POLICY, PROCEDURE_UPDATE: KIND_STYLE.PROCESS,
  STRATEGY_UPDATE: KIND_STYLE.STRATEGY, ROADMAP_UPDATE: KIND_STYLE.ROADMAP,
  KEY_EVENT: KIND_STYLE.COMMUNICATION, ANNOUNCEMENT: KIND_STYLE.COMMUNICATION,
};

export function fmtGovDate(iso: string, lang: string) {
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  } catch { return iso.slice(0, 10); }
}

export function GovAnnouncements({ items, canOpen, canManage }: {
  items: GovAnnouncement[];
  /** The viewer can open the Governance Framework pages (the rest see the notice without a link). */
  canOpen: boolean;
  /** The viewer can add or pin documents, so an empty panel tells them how. */
  canManage: boolean;
}) {
  const { t, lang } = useLang();
  const a = t.announcements;
  const kinds = a.kinds as Record<string, string>;
  const eventTypes = t.commPlan.types as Record<string, string>;
  const itemTypes = t.roadmapExec.types as Record<string, string>;
  const itemStatuses = t.roadmapExec.statuses as Record<string, string>;

  if (items.length === 0 && !canManage) return null;

  return (
    <section className="card p-5 mb-6">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-ink">{a.title}</h2>
          <p className="text-[12px] text-muted mt-0.5">{a.subtitle}</p>
        </div>
        {canOpen && <Link href="/governance/framework" className="text-[12px] text-brand-purple font-semibold hover:underline shrink-0">{a.viewAll}</Link>}
      </div>

      {items.length === 0 ? (
        <p className="text-[12px] text-muted italic">{a.emptyManage}</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((d) => {
            const kindLabel = d.kind === "EVENT" ? eventTypes[d.typeCode] : d.kind === "ITEM" ? itemTypes[d.typeCode] : kinds[d.typeCode];
            const kindStyle = (d.kind === "EVENT" ? EVENT_STYLE[d.typeCode] : KIND_STYLE[d.sectionCode]) ?? KIND_STYLE.STANDARD;
            const overdue = d.kind === "ITEM" && d.statusCode !== "COMPLETED" && !d.isUpcoming;
            // The note beside the badges: a document's status when not approved, an item's status.
            const note = d.kind === "DOC" ? (d.statusCode !== "APPROVED" ? (a.statuses as Record<string, string>)[d.statusCode] ?? d.statusCode : null)
              : d.kind === "ITEM" ? (overdue ? t.roadmapExec.overdue : itemStatuses[d.statusCode] ?? d.statusCode)
              : null;
            const day = d.date ? fmtGovDate(d.date, lang) : null;
            const when = !day ? null
              : d.kind === "EVENT" ? [d.endDate && d.endDate !== d.date ? `${day} – ${fmtGovDate(d.endDate, lang)}` : day, d.timeText].filter(Boolean).join(" · ")
              : d.kind === "ITEM" ? (d.statusCode === "COMPLETED" ? a.completedOn : a.dueOn).replace("{date}", day)
              : (d.isUpcoming ? a.effectiveOn : a.effectiveSince).replace("{date}", day);
            const body = (
              <>
                <div className="flex items-center gap-2 flex-wrap mb-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${kindStyle}`}>{kindLabel ?? d.typeCode}</span>
                  {d.isUpcoming && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-white text-brand-purple border-brand-purple/40">{a.upcoming}</span>}
                  {note && <span className={`text-[10px] font-semibold ${overdue ? "text-red-600" : d.statusCode === "COMPLETED" ? "text-emerald-700" : "text-muted"}`}>{note}</span>}
                  {when && <span className="text-[11px] text-muted ms-auto" dir="auto">{when}</span>}
                </div>
                <div className="text-[13px] font-semibold text-brand-deep group-hover:text-brand-purple" dir="auto">{d.title}{d.versionText ? <span className="text-muted font-normal"> · {d.versionText}</span> : null}</div>
                {d.context && <div className="text-[11px] text-muted mt-0.5" dir="auto">{d.context}</div>}
                {d.description && <p className="text-[12px] text-ink-soft mt-0.5 line-clamp-2" dir="auto">{d.description}</p>}
                {d.location && <div className="text-[11px] text-muted mt-1 truncate" dir="auto">📍 {d.location}</div>}
                {d.attachmentCount > 0 && <div className="text-[11px] text-muted mt-1">{a.attachments.replace("{n}", String(d.attachmentCount))}</div>}
              </>
            );
            const box = "block h-full rounded-lg border border-line bg-white px-4 py-3";
            return (
              <li key={d.key}>
                {canOpen
                  ? <Link href={`/governance/framework/${fwSectionSlug(d.sectionCode)}`} className={`${box} group transition-colors hover:border-brand-purple/50`}>{body}</Link>
                  : <div className={box}>{body}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
