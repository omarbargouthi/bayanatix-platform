import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { bulkAcceptHighBand, bulkAcceptByIds } from "@/lib/queries/classification";

// Two ways to bulk-accept:
// - { attribute_ids: [...] } — checkbox-driven, accepts exactly the selected
//   (manually reviewed) rows regardless of confidence band.
// - { filter: {...}, force? } — legacy blanket accept over an entire filtered
//   set; limited to HIGH-band suggestions by default (spec §7 AC8) since no
//   individual row was reviewed. Pass { force: true } to override the band gate.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  try {
    if (Array.isArray(body.attribute_ids)) {
      const accepted = await bulkAcceptByIds(body.attribute_ids.map(Number), session.userId);
      return NextResponse.json({ ok: true, accepted: accepted.length, acceptedIds: accepted });
    }

    const filter = body.filter ?? {};
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
