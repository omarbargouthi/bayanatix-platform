import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canEditMetadata } from "@/lib/can";
import { confirmEntityCategory } from "@/lib/queries/catalog";

const VALID_CATEGORIES = ["MASTER", "TRANSACTIONAL", "REFERENCE", "SETUP", "SYSTEM"];

// Accept (or override) the crawler-suggested table type. Distinct from the general
// PATCH /api/catalog/entities/[id] edit route — this only ever touches the category
// and always marks it confirmed, whether the steward kept the suggestion or changed it.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canEditMetadata(session))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const entityId = Number(params.id);
  if (isNaN(entityId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const { category } = await req.json().catch(() => ({}));
  if (category !== null && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of ${VALID_CATEGORIES.join(", ")} or null` }, { status: 400 });
  }

  await confirmEntityCategory(entityId, session.userId, category ?? null);
  return NextResponse.json({ ok: true });
}
