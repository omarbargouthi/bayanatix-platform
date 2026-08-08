import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRelationshipTypeByCode, getRelationshipMatrix } from "@/lib/queries/custom-assets";
import * as XLSX from "xlsx";

export async function GET(_req: Request, { params }: { params: { relCode: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const relType = await getRelationshipTypeByCode(params.relCode.toUpperCase());
  if (!relType) return NextResponse.json({ error: "Unknown relationship type" }, { status: 404 });

  const matrix = await getRelationshipMatrix(relType.relTypeId);
  if (!matrix) return NextResponse.json({ error: "Unknown relationship type" }, { status: 404 });

  const gridRows = matrix.rows.map((row) => {
    const out: Record<string, string> = { [relType.relNameText]: row.name };
    for (const col of matrix.cols) {
      const cell = matrix.cells[`${row.id}:${col.id}`];
      out[col.name] = cell === undefined ? "" : cell === null ? "✓" : Object.entries(cell).map(([k, v]) => `${k}: ${v}`).join(", ");
    }
    return out;
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gridRows), "Matrix");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const fileName = `${relType.relCode}_matrix_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
