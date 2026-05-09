import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { addAlias } from "@/lib/queries/glossary";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const glossaryId = Number(params.id);
    if (isNaN(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const aliasId = await addAlias(glossaryId, name.trim());
    return NextResponse.json({ aliasId }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/glossary/terms/[id]/aliases]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
