import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

const VALID_SCOPES = ["NEW_ONLY", "UNCLASSIFIED_ONLY", "ALL"];
const VALID_BANDS  = ["NONE", "HIGH"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const connectionId = Number(params.id);
  if (!Number.isFinite(connectionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await sql<{ settings: Record<string, unknown> }[]>`
    SELECT crawler_settings_json AS settings FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(row.settings);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const connectionId = Number(params.id);
  if (!Number.isFinite(connectionId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  if (body.classify_scope != null && !VALID_SCOPES.includes(body.classify_scope)) {
    return NextResponse.json({ error: `classify_scope must be one of ${VALID_SCOPES.join(", ")}` }, { status: 400 });
  }
  if (body.auto_accept_band != null && !VALID_BANDS.includes(body.auto_accept_band)) {
    return NextResponse.json({ error: `auto_accept_band must be one of ${VALID_BANDS.join(", ")}` }, { status: 400 });
  }

  const [row] = await sql<{ settings: Record<string, unknown> }[]>`
    SELECT crawler_settings_json AS settings FROM bayanat.connection_registry WHERE connection_id = ${connectionId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const merged = { ...row.settings, ...body };
  await sql`UPDATE bayanat.connection_registry SET crawler_settings_json = ${JSON.stringify(merged)}::jsonb WHERE connection_id = ${connectionId}`;
  return NextResponse.json({ ok: true, settings: merged });
}
