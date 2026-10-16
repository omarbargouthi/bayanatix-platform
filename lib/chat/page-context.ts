// Where the user is when they ask Ask Bayanis something: sent with every message, so
// "this", "here" and "this page" can be understood. The client sends the path, the
// breadcrumbs, the filters in the address, and, on record pages, the facts the page
// chose to share (components call useSetChatRecord). Personal data is not shared: a
// page lists statuses, dates and codes, never names or free-text descriptions.

export type ChatFactValue = string | number | boolean | null | string[];

/** A record shown on the page, with the facts the page displays about it. */
export type ChatRecord = { type: string; id: string | number; label: string; facts: Record<string, ChatFactValue> };

export type ChatPage = {
  path: string;
  query: Record<string, string>;
  crumbs: string[];
  record: ChatRecord | null;
};

const str = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : null;

/** Validates and bounds what the client sent; anything unexpected is dropped. */
export function readChatPage(raw: unknown): ChatPage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const path = str(r.path, 200);
  if (!path || !path.startsWith("/")) return null;

  const query: Record<string, string> = {};
  if (r.query && typeof r.query === "object") {
    for (const [k, v] of Object.entries(r.query as Record<string, unknown>).slice(0, 10)) {
      const val = str(v, 100);
      if (/^[\w.-]{1,40}$/.test(k) && val) query[k] = val;
    }
  }
  const crumbs = Array.isArray(r.crumbs) ? r.crumbs.map((c) => str(c, 80)).filter((c): c is string => !!c).slice(0, 6) : [];

  let record: ChatRecord | null = null;
  if (r.record && typeof r.record === "object") {
    const rec = r.record as Record<string, unknown>;
    const type = str(rec.type, 40), id = str(rec.id, 40), label = str(rec.label, 120);
    if (type && id && label) {
      const facts: Record<string, ChatFactValue> = {};
      if (rec.facts && typeof rec.facts === "object") {
        for (const [k, v] of Object.entries(rec.facts as Record<string, unknown>).slice(0, 30)) {
          if (!/^[\w .-]{1,40}$/.test(k)) continue;
          if (v == null || typeof v === "boolean") facts[k] = v ?? null;
          else if (Array.isArray(v)) facts[k] = v.map((x) => str(x, 200)).filter((x): x is string => !!x).slice(0, 20);
          else { const s = str(v, 300); if (s) facts[k] = s; }
        }
      }
      record = { type, id, label, facts };
    }
  }
  return { path, query, crumbs, record };
}

// Ids in the address that the assistant's tools can look up directly.
const PAGE_IDS: { re: RegExp; hint: (m: RegExpMatchArray) => string }[] = [
  { re: /^\/catalog\/(\d+)\/tables\/(\d+)/, hint: (m) => `table: get_asset type DATA_ENTITIES id ${m[2]} (schema DATA_SCHEMAS id ${m[1]})` },
  { re: /^\/catalog\/(\d+)$/, hint: (m) => `schema: get_asset type DATA_SCHEMAS id ${m[1]}` },
  { re: /^\/glossary\/\d+/, hint: () => `glossary term: the last breadcrumb is its name (get_definitions)` },
  { re: /^\/foi\/\d+/, hint: () => `FOI request: the last breadcrumb is its reference (get_foi_request)` },
];

export function pageIdHints(path: string): string[] {
  return PAGE_IDS.flatMap(({ re, hint }) => { const m = path.match(re); return m ? [hint(m)] : []; });
}
