import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkAcceptHighBand } from "@/lib/queries/classification";

// Bulk-accept is limited to HIGH-band suggestions by default (spec §7 AC8); pass
// { force: true } to accept a filtered set regardless of band.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const filter = body.filter ?? {};

  try {
    const count = await bulkAcceptHighBand(
      {
        entityId: filter.entityId != null ? Number(filter.entityId) : undefined,
        schemaId: filter.schemaId != null ? Number(filter.schemaId) : undefined,
        dataSourceId: filter.dataSourceId != null ? Number(filter.dataSourceId) : undefined,
      },
      session.userId,
      !!body.force,
    );
    return NextResponse.json({ ok: true, accepted: count });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
