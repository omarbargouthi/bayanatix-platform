"use client";

// Small shared pieces of the breach register screens: badges, the regulator deadline,
// and times shown in the reader's own time zone (deadlines are counted in hours).
import { useLang } from "@/lib/lang-context";
import type { I18nStrings } from "@/lib/i18n/strings";
import { formatSpan, type AuthorityState, type BreachNotice, type BreachRisk, type BreachStatus, type SubjectsState } from "@/lib/privacy/breach-types";
import { fill } from "./dpia-ui";

const PILL = "inline-block text-[11px] font-semibold border rounded-full px-2 py-0.5 whitespace-nowrap";
const STATUS_STYLE: Record<BreachStatus, string> = {
  REPORTED: "bg-red-50 text-red-700 border-red-200", INVESTIGATING: "bg-amber-50 text-amber-800 border-amber-200",
  CONTAINED: "bg-sky-50 text-sky-700 border-sky-200", CLOSED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NOT_A_BREACH: "bg-slate-100 text-slate-600 border-slate-200",
};
const RISK_STYLE: Record<BreachRisk, string> = {
  UNLIKELY: "bg-emerald-50 text-emerald-700 border-emerald-200", RISK: "bg-amber-50 text-amber-800 border-amber-200", HIGH: "bg-red-50 text-red-700 border-red-200",
};
const AUTHORITY_STYLE: Record<AuthorityState, string> = {
  NOT_REQUIRED: "text-muted", NOTIFIED: "text-emerald-700", ON_TIME: "text-emerald-700", LATE: "text-amber-700", ASAP: "text-amber-700 font-semibold",
  DUE: "text-ink-soft", DUE_SOON: "text-amber-700 font-semibold", OVERDUE: "text-red-700 font-semibold",
};

export function BreachStatusBadge({ status }: { status: BreachStatus }) {
  const { t } = useLang();
  return <span className={`${PILL} ${STATUS_STYLE[status]}`}>{t.breach.statuses[status]}</span>;
}
export function BreachRiskBadge({ level }: { level: BreachRisk | null }) {
  const { t } = useLang();
  if (!level) return <span className={`${PILL} bg-white text-muted border-line`}>{t.breach.notAssessed}</span>;
  return <span className={`${PILL} ${RISK_STYLE[level]}`}>{t.breach.riskShort[level]}</span>;
}

/** "41 h" up to two days, then "3 d 5 h". */
export const span = (ms: number, t: I18nStrings) => formatSpan(ms, t.breach.hoursN, t.breach.daysHours);

/** A moment in the reader's time zone, with Western digits and the Gregorian calendar. */
export function when(iso: string | null | undefined, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-u-ca-gregory-nu-latn" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

/** <input type="datetime-local"> works in local time; the server keeps UTC. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** One regulator notice: its state, and the deadline or the date it was made. */
export function NoticeLine({ n, showLaw = true }: { n: BreachNotice; showLaw?: boolean }) {
  const { t, lang } = useLang();
  const timed = n.state === "DUE" || n.state === "DUE_SOON" || n.state === "OVERDUE";
  const label = timed ? fill(t.breach.authorityStates[n.state], { time: span(new Date(n.deadline!).getTime() - Date.now(), t) }) : t.breach.authorityStates[n.state];
  return (
    <div className={`text-[12px] ${AUTHORITY_STYLE[n.state]}`}>
      {showLaw && <span className="text-[10px] font-bold text-muted me-1.5">{t.breach.regulations[n.regulation]}</span>}
      {label}
      {n.notifiedAt && <span className="text-[11px] text-muted font-normal"> · {when(n.notifiedAt, lang)}</span>}
      {timed && <span className="text-[11px] text-muted font-normal"> · {when(n.deadline, lang)}</span>}
    </div>
  );
}

/** The register's regulator column: every law that applies, one line each. */
export function AuthorityCell({ notices }: { notices: BreachNotice[] }) {
  if (notices.length === 0) return <span className="text-[12px] text-muted">—</span>;
  return <div className="space-y-0.5">{notices.map((n) => <NoticeLine key={n.regulation} n={n} showLaw={notices.length > 1} />)}</div>;
}

export function SubjectsCell({ state }: { state: SubjectsState }) {
  const { t } = useLang();
  const style = state === "PENDING" ? "text-red-700 font-semibold" : state === "NOTIFIED" ? "text-emerald-700" : "text-muted";
  return <span className={`text-[12px] ${style}`}>{t.breach.subjectsStates[state]}</span>;
}

/** The server's error in the user's language when its code is known. */
export const breachError = (t: I18nStrings, res: { code?: string; error?: string }) =>
  (t.breach.errors as Record<string, string>)[res.code ?? ""] ?? res.error ?? t.breach.failed;
