import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listSavedSearches, createSavedSearch } from "@/lib/queries/saved-searches";

// FR-2.6: saved searches — name + save current query/facets, shareable URL.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const saved = await listSavedSearches(session.userId);
  return NextResponse.json({ saved });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = (body.name as string | undefined)?.trim();
  const queryString = (body.queryString as string | undefined)?.trim();
  if (!name || !queryString) return NextResponse.json({ error: "name and queryString are required" }, { status: 400 });

  const created = await createSavedSearch(session.userId, name, queryString);
  return NextResponse.json(created, { status: 201 });
}
