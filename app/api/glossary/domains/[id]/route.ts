import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { sql } from "@/lib/db";
import { updateGlossaryDomain, getGlossarySubDomains } from "@/lib/queries/glossary";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const glossaryId = Number(params.id);
  if (isNaN(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const subDomains = await getGlossarySubDomains(glossaryId);
  return NextResponse.json({ subDomains });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const glossaryId = Number(params.id);
  if (isNaN(glossaryId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [row] = await sql<{ termType: string | null }[]>`
    SELECT term_type AS "termType" FROM bayanat.business_glossaries WHERE glossary_id = ${glossaryId}
  `;
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.termType !== "DOMAIN" && row.termType !== "SUBDOMAIN") {
    return NextResponse.json({ error: "This is not a Domain or Sub-domain — use the term edit endpoint instead" }, { status: 400 });
  }

  const { termName, description, classCode } = await req.json();
  if (!termName?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  try {
    await updateGlossaryDomain(glossaryId, session.userId, {
      termName:    termName.trim(),
      description: description?.trim() || "",
      classCode:   classCode || null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message ?? "Failed to update" }, { status: 500 });
  }
}
