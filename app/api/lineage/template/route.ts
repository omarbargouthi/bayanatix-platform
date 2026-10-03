import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildTemplate } from "@/lib/lineage/excel";

// GET — empty Excel template for uploading lineage.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const buf = await buildTemplate();
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bayanis-lineage-template.xlsx"`,
    },
  });
}
