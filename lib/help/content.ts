// Serving the Help Center: registers the documents' texts as translation keys when they
// change, and returns them in the reader's language (English where a translation is
// missing or out of date).
import { createHash } from "node:crypto";
import { sql } from "../db";
import { upsertKey, type Counters } from "../i18n-admin/translatable-fields";
import { HELP_DOCS } from "./docs";
import { HELP_CATEGORY, helpKey, type HelpDoc, type HelpDocView, type HelpIndexEntry } from "./types";

const HASH_KEY = "help_docs_hash";

/** Every translatable text of the documents, by key. */
function helpTexts(): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of HELP_DOCS) {
    m.set(helpKey(d.slug, "title"), d.title);
    m.set(helpKey(d.slug, "summary"), d.summary);
    for (const s of d.sections) {
      m.set(helpKey(d.slug, `${s.id}.title`), s.title);
      m.set(helpKey(d.slug, `${s.id}.body`), s.body);
    }
  }
  return m;
}

let synced: string | null = null;

/**
 * Brings the HELP_DOCS translation keys in line with the documents: new texts are
 * added, changed ones marked out of date for translators, removed ones deleted.
 * Runs once per server process and again only when the documents change.
 */
export async function ensureHelpKeys(): Promise<void> {
  const texts = helpTexts();
  const hash = createHash("sha256").update(JSON.stringify([...texts])).digest("hex");
  if (synced === hash) return;
  const [row] = await sql<{ value: string }[]>`SELECT value FROM bayanat.system_config WHERE key = ${HASH_KEY}`;
  if (row?.value !== hash) {
    await sql`
      INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code)
      VALUES (${HELP_CATEGORY}, 'Help Center', 'LIST')
      ON CONFLICT (category_code) DO NOTHING
    `;
    const counters: Counters = { keysCreated: 0, keysUpdatedStale: 0, secondarySeeded: 0 };
    for (const [key, text] of texts) await upsertKey(counters, HELP_CATEGORY, key, text, "en", "ar", null);
    await sql`
      DELETE FROM bayanat.translation_keys
      WHERE category_code = ${HELP_CATEGORY} AND NOT (key_code = ANY(${[...texts.keys()]}))
    `;
    await sql`
      INSERT INTO bayanat.system_config (key, value) VALUES (${HASH_KEY}, ${hash})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  synced = hash;
}

/** Current (not out-of-date) translations of the help texts in one language. */
async function translationsFor(lang: string, prefix = "helpdoc."): Promise<Map<string, string>> {
  if (lang === "en") return new Map();
  const rows = await sql<{ key: string; text: string }[]>`
    SELECT tk.key_code AS key, tr.translated_text AS text
    FROM bayanat.translation_keys tk
    JOIN bayanat.translations tr ON tr.key_id = tk.key_id
    WHERE tk.category_code = ${HELP_CATEGORY} AND tk.key_code LIKE ${prefix + "%"}
      AND tr.language_code = ${lang} AND tr.status_code <> 'STALE' AND tr.translated_text IS NOT NULL
  `;
  return new Map(rows.map((r) => [r.key, r.text]));
}

const tr = (map: Map<string, string>, key: string, base: string) => map.get(key) || base;

/** Technical support documents are for platform administrators only. */
const visible = (d: HelpDoc, isAdmin: boolean) => d.audience !== "ADMIN" || isAdmin;

export async function helpIndex(lang: string, isAdmin: boolean): Promise<HelpIndexEntry[]> {
  await ensureHelpKeys();
  const map = await translationsFor(lang);
  return HELP_DOCS.filter((d) => visible(d, isAdmin)).map((d) => ({
    slug: d.slug, group: d.group,
    title: tr(map, helpKey(d.slug, "title"), d.title),
    summary: tr(map, helpKey(d.slug, "summary"), d.summary),
  }));
}

export async function helpDoc(slug: string, lang: string, isAdmin: boolean): Promise<HelpDocView | null> {
  const doc: HelpDoc | undefined = HELP_DOCS.find((d) => d.slug === slug);
  if (!doc || !visible(doc, isAdmin)) return null;
  await ensureHelpKeys();
  const map = await translationsFor(lang);
  return {
    slug: doc.slug, group: doc.group, page: doc.page,
    title: tr(map, helpKey(slug, "title"), doc.title),
    summary: tr(map, helpKey(slug, "summary"), doc.summary),
    sections: doc.sections.map((s) => ({
      id: s.id,
      title: tr(map, helpKey(slug, `${s.id}.title`), s.title),
      body: tr(map, helpKey(slug, `${s.id}.body`), s.body),
    })),
    related: (doc.related ?? []).flatMap((r) => {
      const d = HELP_DOCS.find((x) => x.slug === r);
      return d && visible(d, isAdmin) ? [{ slug: d.slug, title: tr(map, helpKey(d.slug, "title"), d.title) }] : [];
    }),
  };
}

/** Searches titles, summaries and sections in the reader's language. */
export async function searchHelp(q: string, lang: string, isAdmin: boolean): Promise<{ slug: string; title: string; sectionId: string | null; sectionTitle: string | null; snippet: string }[]> {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  await ensureHelpKeys();
  const map = await translationsFor(lang);
  const out: { slug: string; title: string; sectionId: string | null; sectionTitle: string | null; snippet: string }[] = [];
  const snip = (text: string) => {
    const plain = text.replace(/\*\*|\[|\]\([^)]*\)|^[-#>|\d.\s]+/gm, "").replace(/\s+/g, " ");
    const i = plain.toLowerCase().indexOf(needle);
    if (i < 0) return plain.slice(0, 140);
    const start = Math.max(0, i - 50);
    return (start > 0 ? "…" : "") + plain.slice(start, i + needle.length + 90) + "…";
  };
  for (const d of HELP_DOCS) {
    if (!visible(d, isAdmin)) continue;
    const title = tr(map, helpKey(d.slug, "title"), d.title);
    const summary = tr(map, helpKey(d.slug, "summary"), d.summary);
    if (title.toLowerCase().includes(needle) || summary.toLowerCase().includes(needle)) {
      out.push({ slug: d.slug, title, sectionId: null, sectionTitle: null, snippet: summary });
    }
    for (const s of d.sections) {
      const st = tr(map, helpKey(d.slug, `${s.id}.title`), s.title);
      const sb = tr(map, helpKey(d.slug, `${s.id}.body`), s.body);
      if (st.toLowerCase().includes(needle) || sb.toLowerCase().includes(needle)) {
        out.push({ slug: d.slug, title, sectionId: s.id, sectionTitle: st, snippet: snip(sb) });
      }
    }
  }
  return out.slice(0, 40);
}

// ── For Ask Bayanis ──────────────────────────────────────────────────────────
const STOP = new Set(("a an the to of in on for and or is are do does did i we my our me how what why when where which who can could " +
  "should would will be it this that with from by at as use using change get about please bayanis").split(" "));
const words = (text: string) => text.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "")
  .split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w));
/** Light stemming so "restarting" finds "restart" and "logs" finds "log". */
const stem = (w: string) => { const s = w.replace(/(ing|ed|s)$/, "").replace(/e$/, ""); return s.length >= 3 ? s : w; };

export type HelpMatch = { slug: string; docTitle: string; sectionId: string; sectionTitle: string; body: string; href: string };

/**
 * The sections that best match a question, in English and in the reader's language,
 * ranked by how many of the question's words they contain (title words count more).
 * Technical support documents are included only for platform administrators.
 */
export async function findHelpSections(q: string, lang: string, isAdmin: boolean, limit = 5): Promise<HelpMatch[]> {
  const terms = [...new Set(words(q).map(stem))];
  if (terms.length === 0) return [];
  await ensureHelpKeys();
  const map = await translationsFor(lang);
  const scored: (HelpMatch & { score: number })[] = [];
  for (const d of HELP_DOCS) {
    if (!visible(d, isAdmin)) continue;
    const docWords = new Set(words(`${d.title} ${d.summary} ${tr(map, helpKey(d.slug, "title"), "")}`).map(stem));
    for (const s of d.sections) {
      const titleWords = new Set(words(`${s.title} ${tr(map, helpKey(d.slug, `${s.id}.title`), "")}`).map(stem));
      const bodyWords = new Set(words(`${s.body} ${tr(map, helpKey(d.slug, `${s.id}.body`), "")}`).map(stem));
      let score = 0, hits = 0;
      for (const t of terms) {
        const inTitle = titleWords.has(t), inDoc = docWords.has(t), inBody = bodyWords.has(t);
        if (inTitle || inDoc || inBody) hits++;
        score += (inTitle ? 3 : 0) + (inDoc ? 2 : 0) + (inBody ? 1 : 0);
      }
      // Most of the question's words must appear, so "restart services" does not
      // return every section that mentions a service.
      if (hits === 0 || (terms.length > 1 && hits / terms.length < 0.6)) continue;
      scored.push({
        slug: d.slug, docTitle: d.title, sectionId: s.id, sectionTitle: s.title, body: s.body,
        href: `/help/${d.slug}#${s.id}`, score: score * (hits / terms.length),
      });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  return scored.filter((m) => m.score >= best * 0.4).slice(0, limit).map(({ score: _s, ...m }) => m);
}

/** The documents about the page at `path` (the most specific match: /privacy/breaches/9
 *  finds the breaches document rather than the privacy one). */
export function helpDocsForPath(path: string, isAdmin: boolean): { slug: string; title: string }[] {
  const matches = HELP_DOCS.filter((d) => d.page && visible(d, isAdmin) && (path === d.page || path.startsWith(d.page + "/")));
  const longest = Math.max(0, ...matches.map((d) => d.page!.length));
  return matches.filter((d) => d.page!.length === longest).map((d) => ({ slug: d.slug, title: d.title }));
}

/** A whole document in English (the reviewed original), for the assistant. */
export function helpDocForAssistant(slug: string, isAdmin: boolean): { title: string; summary: string; href: string; sections: { id: string; title: string; body: string }[] } | null {
  const d = HELP_DOCS.find((x) => x.slug === slug);
  if (!d || !visible(d, isAdmin)) return null;
  return { title: d.title, summary: d.summary, href: `/help/${d.slug}`, sections: d.sections.map((s) => ({ id: s.id, title: s.title, body: s.body })) };
}
