// Metadata propagation along lineage (db/142).
//
// AUTO   — a column's classification (its CLASSIFICATION glossary term: level, PI
//          flag, PI category) flows to downstream columns over trusted pass-through
//          links, hop after hop. When several sources feed one column the most
//          restrictive term wins (PI first, then classification rank). A target that
//          has its own (manual) classification is never touched, and inherited links
//          are removed again when their source stops providing them.
// SUGGEST — business terms, descriptions, tags and retention category (and
//          classification over calculated or medium-confidence links) are offered to
//          stewards in the Propagation queue; nothing changes until they accept.
//
// Which links count: manual, confirmed or HIGH-confidence links are trusted;
// MEDIUM-confidence links only produce suggestions; LOW / UNKNOWN are ignored.
// Copy-like transformations pass values through; calculations only suggest; links
// whose logic masks/hashes/encrypts (or whose target column is encrypted) stop PI.
import { sql } from "../db";
import { logUpdate } from "../audit";
import { maskStoredPersonalData } from "../privacy/pi-housekeeping";

export type PropagationField = "CLASSIFICATION" | "BUSINESS_TERM" | "DESCRIPTION" | "TAG" | "RETENTION";
export type PropagationSummary = { applied: number; removed: number; suggested: number; superseded: number; columnsClassified: number };

const PASS_THROUGH = new Set(["DIRECT", "CAST", "LOOKUP", "JOIN", "FILTER", "MANUAL"]);
const CALCULATED = new Set(["EXPRESSION", "AGGREGATION", "MEASURE"]);
const MASK_RE = /\b(mask\w*|hash\w*|encrypt\w*|tokeni[sz]\w*|redact\w*|anonymi[sz]\w*|pseudonymi[sz]\w*|sha(1|2|256|512)?|md5)\b/i;
const SYSTEM_ACTOR = "SYSTEM";

type Edge = {
  id: number; source: number; target: number; typeCode: string | null; logic: string | null;
  provenance: string; isConfirmed: boolean; confidence: string | null; targetEncrypted: boolean;
};
type EdgeMode = "FULL" | "SUGGEST" | "SKIP";

export function edgeMode(e: Pick<Edge, "typeCode" | "provenance" | "isConfirmed" | "confidence">): EdgeMode {
  const trusted = e.provenance === "MANUAL" || e.isConfirmed || e.confidence === "HIGH";
  if (!trusted && e.confidence !== "MEDIUM") return "SKIP";
  const type = e.typeCode ?? "UNKNOWN";
  const typeMode: EdgeMode = PASS_THROUGH.has(type) ? "FULL" : CALCULATED.has(type) ? "SUGGEST" : "SKIP";
  if (typeMode === "SKIP") return "SKIP";
  return trusted ? typeMode : "SUGGEST";
}
const isMasked = (e: Edge) => e.targetEncrypted || MASK_RE.test(e.logic ?? "");

type Term = { id: number; rank: number; isPii: boolean; name: string };
type Inherit = { term: number; root: number; hop: number; via: number };

// PI first (losing the PI flag is the costly mistake), then classification rank,
// then the nearer source, then a stable id order.
function better(terms: Map<number, Term>, a: Inherit, b: Inherit | undefined): boolean {
  if (!b) return true;
  const ta = terms.get(a.term), tb = terms.get(b.term);
  const pa = ta?.isPii ? 1 : 0, pb = tb?.isPii ? 1 : 0;
  if (pa !== pb) return pa > pb;
  const ra = ta?.rank ?? 0, rb = tb?.rank ?? 0;
  if (ra !== rb) return ra > rb;
  if (a.term !== b.term) return a.term < b.term;
  return a.hop < b.hop;
}

export async function runPropagation(opts: { log?: (m: string) => Promise<void> | void } = {}): Promise<PropagationSummary> {
  const log = async (m: string) => { await opts.log?.(m); };
  const summary: PropagationSummary = { applied: 0, removed: 0, suggested: 0, superseded: 0, columnsClassified: 0 };

  // Inherited links removed outside the engine (e.g. a steward re-saving the
  // column's terms with a different classification) leave their record behind:
  // close those first so "Applied automatically" only lists links that exist.
  const orphaned = await sql`
    UPDATE bayanat.lineage_propagations p SET status_code = 'SUPERSEDED', decided_at = now(),
      reason_text = 'Classification changed by hand on the target'
    WHERE p.mode_code = 'AUTO' AND p.status_code = 'APPLIED'
      AND NOT EXISTS (SELECT 1 FROM bayanat.asset_business_terms abt WHERE abt.propagation_id = p.propagation_id)
  `;
  summary.removed += orphaned.count;

  // ── Load the graph and current state ─────────────────────────────────────
  const edges = (await sql<Edge[]>`
    SELECT dl.lineage_id AS id, dl.source_asset_id AS source, dl.target_asset_id AS target,
           dl.transformation_type_code AS "typeCode", dl.transformation_logic_text AS logic,
           dl.provenance_code AS provenance, coalesce(dl.is_confirmed, false) AS "isConfirmed",
           dl.confidence_code AS confidence, coalesce(ta.is_encrypted, false) AS "targetEncrypted"
    FROM bayanat.data_lineage dl
    JOIN bayanat.data_attributes ta ON ta.attribute_id = dl.target_asset_id
    WHERE dl.lineage_scope_code = 'ATTRIBUTE_LEVEL' AND dl.source_asset_id <> dl.target_asset_id
  `).map((e) => ({ ...e, id: Number(e.id), source: Number(e.source), target: Number(e.target) }));
  const modes = new Map(edges.map((e) => [e.id, edgeMode(e)]));

  const termRows = await sql<{ id: number; rank: number | null; isPii: boolean | null; name: string }[]>`
    SELECT bg.glossary_id AS id, ct.rank_order AS rank, bg.is_pii_indicator AS "isPii", bg.term_name_text AS name
    FROM bayanat.business_glossaries bg LEFT JOIN bayanat.classification_types ct ON ct.class_code = bg.classification_code
    WHERE bg.classification_code IS NOT NULL OR bg.is_pii_indicator
  `;
  const terms = new Map(termRows.map((t) => [Number(t.id), { id: Number(t.id), rank: t.rank ?? 0, isPii: !!t.isPii, name: t.name }]));

  const classLinks = await sql<{ col: number; term: number; propagationId: number | null }[]>`
    SELECT asset_id AS col, glossary_id AS term, propagation_id AS "propagationId"
    FROM bayanat.asset_business_terms WHERE asset_type_code = 'DATA_ATTRIBUTES' AND term_role = 'CLASSIFICATION'
  `;
  const manual = new Map<number, number>();
  const inherited = new Map<number, { term: number; propagationId: number }>();
  for (const l of classLinks) {
    const col = Number(l.col), term = Number(l.term);
    if (l.propagationId == null) {
      const prev = manual.get(col);
      if (prev == null || better(terms, { term, root: col, hop: 0, via: 0 }, { term: prev, root: col, hop: 0, via: 0 })) manual.set(col, term);
    } else {
      inherited.set(col, { term, propagationId: Number(l.propagationId) });
    }
  }

  // ── AUTO: classification, to a fixed point, starting from manual roots only
  //    (so a value can never keep itself alive around a cycle) ──────────────────
  let eff = new Map<number, Inherit>([...manual].map(([col, term]) => [col, { term, root: col, hop: 0, via: 0 }]));
  for (let i = 0; i < 40; i++) {
    const next = new Map(eff);
    let changed = false;
    for (const e of edges) {
      if (modes.get(e.id) !== "FULL" || isMasked(e) || manual.has(e.target)) continue;
      const s = eff.get(e.source);
      if (!s) continue;
      const cand = { term: s.term, root: s.root, hop: s.hop + 1, via: e.id };
      if (better(terms, cand, next.get(e.target))) { next.set(e.target, cand); changed = true; }
    }
    eff = next;
    if (!changed) break;
  }

  const affected = new Set<number>([...inherited.keys(), ...[...eff.keys()].filter((c) => !manual.has(c))]);
  for (const col of affected) {
    const want = manual.has(col) ? undefined : eff.get(col);
    const cur = inherited.get(col);
    if (want && cur && cur.term === want.term) continue;
    const oldName = cur ? terms.get(cur.term)?.name ?? null : null;
    const newName = want ? terms.get(want.term)?.name ?? null : null;

    await sql.begin(async (tx) => {
      if (cur) {
        await tx`DELETE FROM bayanat.asset_business_terms WHERE propagation_id = ${cur.propagationId} AND asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${col}`;
        await tx`
          UPDATE bayanat.lineage_propagations SET status_code = 'SUPERSEDED', decided_at = now(),
            reason_text = ${manual.has(col) ? "Column now has its own classification" : want ? "A more restrictive classification arrived" : "Source no longer provides this classification"}
          WHERE propagation_id = ${cur.propagationId}
        `;
        summary.removed++;
      }
      if (want) {
        const [p] = await tx<{ id: number }[]>`
          INSERT INTO bayanat.lineage_propagations
            (field_code, mode_code, status_code, target_asset_type, target_asset_id, source_asset_type, source_asset_id, value_ref_id, via_lineage_id, hop_count)
          VALUES ('CLASSIFICATION', 'AUTO', 'APPLIED', 'DATA_ATTRIBUTES', ${col}, 'DATA_ATTRIBUTES', ${want.root}, ${want.term}, ${want.via}, ${want.hop})
          RETURNING propagation_id AS id
        `;
        const linked = await tx`
          INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role, propagation_id)
          VALUES (${want.term}, 'DATA_ATTRIBUTES', ${col}, NULL, 'CLASSIFICATION', ${p.id})
          ON CONFLICT (asset_type_code, asset_id, glossary_id) DO NOTHING
          RETURNING abt_id
        `;
        if (linked.length === 0) {
          await tx`UPDATE bayanat.lineage_propagations SET status_code = 'SUPERSEDED', decided_at = now(), reason_text = 'Term already linked to this column' WHERE propagation_id = ${p.id}`;
        } else {
          summary.applied++;
        }
      }
    });
    await logUpdate("DATA_ATTRIBUTES", col, SYSTEM_ACTOR, [{ field: "classification (inherited via lineage)", oldVal: oldName, newVal: newName }]).catch(() => {});
  }
  summary.columnsClassified = [...eff.keys()].filter((c) => !manual.has(c)).length;

  // ── SUGGEST: one hop from each direct source ─────────────────────────────
  type Want = { field: PropagationField; targetType: string; target: number; sourceType: string; source: number; valueRef: number | null; valueText: string | null; via: number; reason: string };
  const wants: Want[] = [];
  const key = (w: { field: string; targetType: string; target: number; valueRef: number | null }) => `${w.field}|${w.targetType}|${w.target}|${w.field === "DESCRIPTION" ? "" : w.valueRef ?? ""}`;

  const cols = [...new Set(edges.flatMap((e) => [e.source, e.target]))];
  const colInfo = cols.length === 0 ? [] : await sql<{ id: number; description: string | null }[]>`
    SELECT attribute_id AS id, nullif(trim(description_text), '') AS description FROM bayanat.data_attributes WHERE attribute_id = ANY(${cols})
  `;
  const descOf = new Map(colInfo.map((c) => [Number(c.id), c.description]));
  const termLinks = cols.length === 0 ? [] : await sql<{ col: number; term: number }[]>`
    SELECT asset_id AS col, glossary_id AS term FROM bayanat.asset_business_terms
    WHERE asset_type_code = 'DATA_ATTRIBUTES' AND term_role = 'ENRICHMENT' AND asset_id = ANY(${cols})
  `;
  const termsOf = new Map<number, Set<number>>();
  for (const t of termLinks) (termsOf.get(Number(t.col)) ?? termsOf.set(Number(t.col), new Set()).get(Number(t.col))!).add(Number(t.term));
  const tagLinks = cols.length === 0 ? [] : await sql<{ col: number; tag: number }[]>`
    SELECT asset_id AS col, tag_id AS tag FROM bayanat.asset_tags WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ANY(${cols})
  `;
  const tagsOf = new Map<number, Set<number>>();
  for (const t of tagLinks) (tagsOf.get(Number(t.col)) ?? tagsOf.set(Number(t.col), new Set()).get(Number(t.col))!).add(Number(t.tag));
  const classified = (col: number) => manual.has(col) || eff.has(col);

  for (const e of edges) {
    const mode = modes.get(e.id);
    if (mode === "SKIP") continue;
    const base = { targetType: "DATA_ATTRIBUTES", target: e.target, sourceType: "DATA_ATTRIBUTES", source: e.source, via: e.id };
    // Classification over a calculation or a medium-confidence link: a suggestion only.
    const s = eff.get(e.source);
    if (s && !classified(e.target) && !isMasked(e) && mode === "SUGGEST") {
      wants.push({ ...base, field: "CLASSIFICATION", valueRef: s.term, valueText: null, reason: `${e.typeCode ?? "Unknown"} link${e.confidence === "MEDIUM" ? " (medium confidence)" : ""}` });
    }
    if (mode !== "FULL") continue;
    const desc = descOf.get(e.source);
    if (desc && !descOf.get(e.target)) wants.push({ ...base, field: "DESCRIPTION", valueRef: null, valueText: desc, reason: "Target has no description" });
    for (const term of termsOf.get(e.source) ?? []) {
      if (!termsOf.get(e.target)?.has(term)) wants.push({ ...base, field: "BUSINESS_TERM", valueRef: term, valueText: null, reason: "Business term on the source column" });
    }
    for (const tag of tagsOf.get(e.source) ?? []) {
      if (!tagsOf.get(e.target)?.has(tag)) wants.push({ ...base, field: "TAG", valueRef: tag, valueText: null, reason: "Tag on the source column" });
    }
  }

  // Retention category along trusted table-level links.
  const entityEdges = await sql<{ id: number; source: number; target: number; typeCode: string | null; provenance: string; isConfirmed: boolean; confidence: string | null; srcCat: number | null; tgtCat: number | null }[]>`
    SELECT dl.lineage_id AS id, dl.source_asset_id AS source, dl.target_asset_id AS target, dl.transformation_type_code AS "typeCode",
           dl.provenance_code AS provenance, coalesce(dl.is_confirmed, false) AS "isConfirmed", dl.confidence_code AS confidence,
           se.retention_category_id AS "srcCat", te.retention_category_id AS "tgtCat"
    FROM bayanat.data_lineage dl
    JOIN bayanat.data_entities se ON se.entity_id = dl.source_asset_id
    JOIN bayanat.data_entities te ON te.entity_id = dl.target_asset_id
    WHERE dl.lineage_scope_code = 'ENTITY_LEVEL' AND dl.source_asset_id <> dl.target_asset_id
      AND se.retention_category_id IS NOT NULL AND te.retention_category_id IS NULL
  `;
  for (const e of entityEdges) {
    const trusted = e.provenance === "MANUAL" || e.isConfirmed || e.confidence === "HIGH";
    if (!trusted && e.confidence !== "MEDIUM") continue;
    wants.push({ field: "RETENTION", targetType: "DATA_ENTITIES", target: Number(e.target), sourceType: "DATA_ENTITIES", source: Number(e.source), valueRef: Number(e.srcCat), valueText: null, via: Number(e.id), reason: "Retention category of the source table" });
  }

  // Reconcile with the queue: new suggestions in, ones that no longer apply out,
  // and never re-suggest something a steward already rejected.
  const open = await sql<{ id: number; field: string; targetType: string; target: number; valueRef: number | null; status: string }[]>`
    SELECT propagation_id AS id, field_code AS field, target_asset_type AS "targetType", target_asset_id AS target, value_ref_id AS "valueRef", status_code AS status
    FROM bayanat.lineage_propagations WHERE mode_code = 'SUGGEST' AND status_code IN ('SUGGESTED', 'REJECTED')
  `;
  const existing = new Map<string, { id: number; status: string }>();
  for (const o of open) existing.set(key({ ...o, target: Number(o.target) }), { id: Number(o.id), status: o.status });
  const wanted = new Map<string, Want>();
  for (const w of wants) if (!wanted.has(key(w))) wanted.set(key(w), w);

  for (const [k, w] of wanted) {
    if (existing.has(k)) continue;
    await sql`
      INSERT INTO bayanat.lineage_propagations
        (field_code, mode_code, status_code, target_asset_type, target_asset_id, source_asset_type, source_asset_id, value_ref_id, value_text, via_lineage_id, reason_text)
      VALUES (${w.field}, 'SUGGEST', 'SUGGESTED', ${w.targetType}, ${w.target}, ${w.sourceType}, ${w.source}, ${w.valueRef}, ${w.valueText}, ${w.via}, ${w.reason})
    `;
    summary.suggested++;
  }
  const stale = [...existing].filter(([k, v]) => v.status === "SUGGESTED" && !wanted.has(k)).map(([, v]) => v.id);
  if (stale.length) {
    await sql`
      UPDATE bayanat.lineage_propagations SET status_code = 'SUPERSEDED', decided_at = now(), reason_text = 'No longer applies (the target was updated or the link changed)'
      WHERE propagation_id = ANY(${stale})
    `;
    summary.superseded += stale.length;
  }

  // Classifications may have just turned columns into personal-data columns.
  const masked = await maskStoredPersonalData();
  if (masked.profiles + masked.dqSamplesMasked > 0) await log(`Personal data removed from stored profiles: ${masked.profiles} profile(s), ${masked.dqSamplesMasked} DQ sample(s).`);

  await log(`Propagation: ${summary.applied} classification(s) applied, ${summary.removed} removed/replaced, ${summary.suggested} new suggestion(s), ${summary.superseded} suggestion(s) no longer applicable; ${summary.columnsClassified} column(s) inherit a classification.`);
  return summary;
}

// ── Triggering: debounced, one run at a time ───────────────────────────────
let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<unknown> | null = null;
let rerun = false;

/** Ask for a propagation run soon — coalesces bursts (e.g. a bulk classification) into one run. */
export function schedulePropagation(reason = "change"): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (running) { rerun = true; return; }
    running = runPropagation({ log: (m) => console.log(`[propagation:${reason}] ${m}`) })
      .catch((e) => console.error("[propagation] failed", e))
      .finally(() => { running = null; if (rerun) { rerun = false; schedulePropagation("follow-up"); } });
  }, 3000);
}

// ── Steward decisions on suggestions ───────────────────────────────────────
export async function decideSuggestion(
  propagationId: number, userId: string, accept: boolean,
): Promise<{ ok: true } | { error: string }> {
  const [p] = await sql<{ field: PropagationField; status: string; targetType: string; target: number; valueRef: number | null; valueText: string | null }[]>`
    SELECT field_code AS field, status_code AS status, target_asset_type AS "targetType", target_asset_id AS target,
           value_ref_id AS "valueRef", value_text AS "valueText"
    FROM bayanat.lineage_propagations WHERE propagation_id = ${propagationId} AND mode_code = 'SUGGEST'
  `;
  if (!p) return { error: "Suggestion not found" };
  if (p.status !== "SUGGESTED") return { error: `Already ${p.status.toLowerCase()}` };

  if (!accept) {
    await sql`UPDATE bayanat.lineage_propagations SET status_code = 'REJECTED', decided_by_user_id = ${userId}, decided_at = now() WHERE propagation_id = ${propagationId}`;
    return { ok: true };
  }

  const target = Number(p.target);
  let field = "", newVal: string | null = null;
  switch (p.field) {
    case "CLASSIFICATION": {
      const [has] = await sql`SELECT 1 FROM bayanat.asset_business_terms WHERE asset_type_code = 'DATA_ATTRIBUTES' AND asset_id = ${target} AND term_role = 'CLASSIFICATION'`;
      if (has) return { error: "This column already has a classification" };
      await sql`INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role) VALUES (${p.valueRef}, 'DATA_ATTRIBUTES', ${target}, ${userId}, 'CLASSIFICATION') ON CONFLICT DO NOTHING`;
      field = "classification"; newVal = String(p.valueRef);
      break;
    }
    case "BUSINESS_TERM":
      await sql`INSERT INTO bayanat.asset_business_terms (glossary_id, asset_type_code, asset_id, linked_by, term_role) VALUES (${p.valueRef}, 'DATA_ATTRIBUTES', ${target}, ${userId}, 'ENRICHMENT') ON CONFLICT DO NOTHING`;
      field = "business_term"; newVal = String(p.valueRef);
      break;
    case "TAG":
      await sql`INSERT INTO bayanat.asset_tags (tag_id, asset_type_code, asset_id, assigned_by) VALUES (${p.valueRef}, 'DATA_ATTRIBUTES', ${target}, ${userId}) ON CONFLICT DO NOTHING`;
      field = "tag"; newVal = String(p.valueRef);
      break;
    case "DESCRIPTION":
      await sql`UPDATE bayanat.data_attributes SET description_text = ${p.valueText} WHERE attribute_id = ${target}`;
      field = "description_text"; newVal = p.valueText;
      break;
    case "RETENTION":
      await sql`UPDATE bayanat.data_entities SET retention_category_id = ${p.valueRef} WHERE entity_id = ${target}`;
      field = "retention_category_id"; newVal = String(p.valueRef);
      break;
  }
  await sql`UPDATE bayanat.lineage_propagations SET status_code = 'ACCEPTED', decided_by_user_id = ${userId}, decided_at = now() WHERE propagation_id = ${propagationId}`;
  await logUpdate(p.targetType, target, userId, [{ field: `${field} (accepted lineage suggestion)`, oldVal: null, newVal }]).catch(() => {});
  if (p.field === "CLASSIFICATION") schedulePropagation("accepted-classification");
  return { ok: true };
}
