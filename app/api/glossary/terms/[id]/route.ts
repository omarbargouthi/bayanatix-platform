import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateGlossaryTerm } from "@/lib/queries/glossary";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const glossaryId = Number(params.id);
    if (isNaN(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { definition, format, businessRules, classCode, isPii, piCategory, example, termType } = await req.json();

    if (!definition?.trim()) {
      return NextResponse.json({ error: "definition is required" }, { status: 400 });
    }

    await updateGlossaryTerm(glossaryId, session.userId, {
      definition:    definition.trim(),
      format:        typeof format        === "string" ? format        : "",
      businessRules: typeof businessRules === "string" ? businessRules : "",
      classCode:     classCode  ?? null,
      isPii:         isPii === true,
      piCategory:    piCategory ?? null,
      example:       typeof example       === "string" ? example       : "",
      termType:      termType   ?? "TERM",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/glossary/terms/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
