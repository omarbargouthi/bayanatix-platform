import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

// GET — list requested attributes for a case
export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const rows = await sql`
    SELECT req_attr_id AS "reqAttrId", attribute_name_text AS "name",
           description_text AS "description", format_hint_text AS "formatHint", sort_order AS "sortOrder"
    FROM bayanat.foi_requested_attributes
    WHERE foi_request_id = ${id}
    ORDER BY sort_order, req_attr_id
  `;
  return NextResponse.json(rows);
}

// POST — replace all requested attributes (officer adds on behalf of walk-in / phone requests)
export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const attrs: { name: string; description?: string; formatHint?: string }[] = body.attributes ?? [];
  if (!Array.isArray(attrs) || attrs.length === 0) {
    return NextResponse.json({ error: "attributes array required" }, { status: 400 });
  }

  try {
    // Delete existing and re-insert
    await sql`DELETE FROM bayanat.foi_requested_attributes WHERE foi_request_id = ${id}`;
    for (let i = 0; i < attrs.length; i++) {
      const a = attrs[i];
      if (!a.name?.trim()) continue;
      await sql`
        INSERT INTO bayanat.foi_requested_attributes
          (foi_request_id, attribute_name_text, description_text, format_hint_text, sort_order)
        VALUES (${id}, ${a.name.trim()}, ${a.description?.trim() || null}, ${a.formatHint?.trim() || null}, ${i})
      `;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[FOI ATTRIBUTES]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
