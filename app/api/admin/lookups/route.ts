import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listLookups, listLookupGroups, createLookup } from "@/lib/queries/app-lookups";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);

  // ?groupsOnly=true — return distinct groups with counts instead of lookup rows
  if (searchParams.get("groupsOnly") === "true") {
    const groups = await listLookupGroups();
    return NextResponse.json(groups);
  }

  const group = searchParams.get("group") ?? undefined;
  const lookups = await listLookups(group);
  return NextResponse.json(lookups);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: {
    lookupGroup:  string;
    lookupCode:   string;
    lookupLabel:  string;
    labelAr?:     string | null;
    description?: string | null;
    sortOrder?:   number | null;
    isActive?:    boolean | null;
  } = await req.json();

  if (!body.lookupGroup || !body.lookupCode || !body.lookupLabel) {
    return NextResponse.json(
      { error: "lookupGroup, lookupCode, and lookupLabel are required" },
      { status: 400 },
    );
  }

  const lookupId = await createLookup(body);
  return NextResponse.json({ lookupId }, { status: 201 });
}
