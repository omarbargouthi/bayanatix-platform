import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await sql<{ key: string; value: string }[]>`
    SELECT key, value FROM bayanat.system_config
  `;
  const config = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return NextResponse.json({ config });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json() as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    await sql`
      INSERT INTO bayanat.system_config (key, value)
      VALUES (${key}, ${String(value)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  }
  return NextResponse.json({ ok: true });
}
