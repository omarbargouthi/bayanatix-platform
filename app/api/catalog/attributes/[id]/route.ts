import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { updateAttribute } from "@/lib/queries/catalog";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const attributeId = Number(params.id);
    if (isNaN(attributeId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { description, friendlyName, isEncrypted, columnType, glossaryTerm } = await req.json();

    await updateAttribute(attributeId, session.userId, {
      description:  typeof description  === "string" ? description  : "",
      friendlyName: typeof friendlyName === "string" ? friendlyName : "",
      isEncrypted:  isEncrypted === true,
      columnType:   columnType   ?? null,
      glossaryTerm: typeof glossaryTerm === "string" ? glossaryTerm : "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[PATCH /api/catalog/attributes/[id]]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
