// Roadmap execution (Governance Framework › Roadmap): the milestones of a roadmap document
// and the deliverables under them, each with a status. The roadmap's own execution status
// is worked out from them (roadmapExecution in lib/gov-framework-sections.ts).
import { sql } from "../db";
import { ROADMAP_ITEM_STATUSES } from "../gov-framework-sections";

export type RoadmapItem = {
  itemId: number; docId: number; parentItemId: number | null;
  typeCode: "MILESTONE" | "DELIVERABLE";
  title: string; description: string | null; statusCode: string;
  dueDate: string | null; completedDate: string | null; owner: string | null;
  announce: boolean;
};

export type RoadmapItemInput = {
  parentItemId?: number | null; typeCode?: string; title?: string; description?: string | null;
  statusCode?: string; dueDate?: string | null; completedDate?: string | null; owner?: string | null; announce?: boolean;
};

export class RoadmapItemError extends Error {}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function clean(docId: number, data: RoadmapItemInput, itemId?: number) {
  const title = text(data.title);
  if (!title) throw new RoadmapItemError("A title is required.");
  const typeCode = data.typeCode === "DELIVERABLE" ? "DELIVERABLE" : "MILESTONE";
  // Only a deliverable sits under something, and only under a milestone of the same roadmap.
  let parentItemId: number | null = null;
  if (typeCode === "DELIVERABLE" && data.parentItemId != null) {
    const [parent] = await sql`
      SELECT 1 FROM bayanat.gov_roadmap_items
      WHERE item_id = ${Number(data.parentItemId)} AND doc_id = ${docId} AND item_type_code = 'MILESTONE' AND item_id <> ${itemId ?? 0}
    `;
    if (!parent) throw new RoadmapItemError("The milestone chosen does not belong to this roadmap.");
    parentItemId = Number(data.parentItemId);
  }
  const statusCode = (ROADMAP_ITEM_STATUSES as readonly string[]).includes(data.statusCode ?? "") ? data.statusCode! : "NOT_STARTED";
  return {
    typeCode, parentItemId, title, description: text(data.description), statusCode,
    dueDate: date(data.dueDate),
    // Only a completed item has a completion date; without one given, today is recorded (see completedOn).
    completedDate: statusCode === "COMPLETED" ? date(data.completedDate) : null,
    owner: text(data.owner), announce: data.announce === true,
  };
}

/** The completion date to store: the one given, or the database's today for a completed item. */
const completedOn = (i: { statusCode: string; completedDate: string | null }) =>
  i.statusCode === "COMPLETED" ? sql`coalesce(${i.completedDate}::date, current_date)` : sql`NULL`;

export async function isRoadmapDoc(docId: number): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM bayanat.gov_framework_docs WHERE doc_id = ${docId} AND section_code = 'ROADMAP'`;
  return rows.length > 0;
}

/** Milestones in date order, each followed by its deliverables; loose deliverables last. */
export async function listRoadmapItems(docId: number): Promise<RoadmapItem[]> {
  return sql<RoadmapItem[]>`
    SELECT i.item_id AS "itemId", i.doc_id AS "docId", i.parent_item_id AS "parentItemId", i.item_type_code AS "typeCode",
           i.title, i.description, i.status_code AS "statusCode",
           i.due_date::text AS "dueDate", i.completed_date::text AS "completedDate", i.owner_text AS owner,
           i.announce_indicator AS announce
    FROM   bayanat.gov_roadmap_items i
    LEFT   JOIN bayanat.gov_roadmap_items p ON p.item_id = i.parent_item_id
    WHERE  i.doc_id = ${docId}
    ORDER  BY (i.item_type_code = 'DELIVERABLE' AND i.parent_item_id IS NULL),      -- loose deliverables last
              coalesce(p.due_date, i.due_date) NULLS LAST, coalesce(p.item_id, i.item_id),
              (i.parent_item_id IS NOT NULL), i.due_date NULLS LAST, i.item_id
  `;
}

export async function createRoadmapItem(docId: number, data: RoadmapItemInput, userId: string): Promise<number> {
  const i = await clean(docId, data);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO bayanat.gov_roadmap_items
      (doc_id, parent_item_id, item_type_code, title, description, status_code, due_date, completed_date, owner_text, announce_indicator, created_by)
    VALUES (${docId}, ${i.parentItemId}, ${i.typeCode}, ${i.title}, ${i.description}, ${i.statusCode}, ${i.dueDate}, ${completedOn(i)}, ${i.owner}, ${i.announce}, ${userId})
    RETURNING item_id AS id
  `;
  return row.id;
}

/** Replaces the item with what the form holds. */
export async function updateRoadmapItem(docId: number, itemId: number, data: RoadmapItemInput): Promise<boolean> {
  const i = await clean(docId, data, itemId);
  // A milestone that still has deliverables cannot become a deliverable itself.
  if (i.typeCode === "DELIVERABLE") {
    const [child] = await sql`SELECT 1 FROM bayanat.gov_roadmap_items WHERE parent_item_id = ${itemId} LIMIT 1`;
    if (child) throw new RoadmapItemError("This milestone has deliverables; move or delete them before changing its type.");
  }
  const rows = await sql`
    UPDATE bayanat.gov_roadmap_items SET
      parent_item_id = ${i.parentItemId}, item_type_code = ${i.typeCode}, title = ${i.title}, description = ${i.description},
      status_code = ${i.statusCode}, due_date = ${i.dueDate}, completed_date = ${completedOn(i)},
      owner_text = ${i.owner}, announce_indicator = ${i.announce}, updated_at = now()
    WHERE item_id = ${itemId} AND doc_id = ${docId}
    RETURNING item_id
  `;
  return rows.length > 0;
}

/** Deletes an item; a milestone takes its deliverables with it. */
export async function deleteRoadmapItem(docId: number, itemId: number): Promise<void> {
  await sql`DELETE FROM bayanat.gov_roadmap_items WHERE item_id = ${itemId} AND doc_id = ${docId}`;
}
