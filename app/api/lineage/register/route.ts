import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRegister, type RegisterFilters } from "@/lib/lineage/register";
import { buildExport } from "@/lib/lineage/excel";

// GET — the Mapping Register (all lineage links + pending proposals), searchable
// and filterable. ?format=xlsx returns the filtered list in the upload template's
// format (up to 5,000 rows) so it can be edited and re-imported.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const pick = <T extends string>(v: string | null, allowed: readonly T[]): T | "" => (allowed as readonly string[]).includes(v ?? "") ? (v as T) : "";
  const filters: RegisterFilters = {
    q: sp.get("q") ?? "",
    origin: pick(sp.get("origin"), ["SCANNED", "MANUAL"] as const),
    status: pick(sp.get("status"), ["ACTIVE", "PENDING", "REVIEW"] as const),
    level: pick(sp.get("level"), ["ENTITY_LEVEL", "ATTRIBUTE_LEVEL"] as const),
    page: Number(sp.get("page") ?? 1),
  };

  if (sp.get("format") === "xlsx") {
    const { rows } = await getRegister({ ...filters, page: 1, pageSize: 5000 });
    const active = rows.filter((r) => r.lineageId != null);
    const buf = await buildExport(
      active.map((r) => ({
        sourceSystem: r.sourceSystem ?? "", sourceSchema: r.sourceSchema ?? "", sourceTable: r.sourceTable ?? "", sourceColumn: r.sourceColumn ?? "",
        targetSystem: r.targetSystem ?? "", targetSchema: r.targetSchema ?? "", targetTable: r.targetTable ?? "", targetColumn: r.targetColumn ?? "",
        transformationType: r.transformationTypeCode ?? "", logic: r.logic ?? "",
      })),
      active.map((r) => (r.provenance === "SCANNED" ? "Scanned" : "Manual")),
    );
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="lineage-mapping-register.xlsx"`,
      },
    });
  }

  return NextResponse.json(await getRegister({ ...filters, pageSize: 50 }));
}
