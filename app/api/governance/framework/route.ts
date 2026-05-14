import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listGovDocs, createGovDoc, getSectionCounts } from "@/lib/queries/gov-framework";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const section = new URL(req.url).searchParams.get("section") ?? undefined;
  const [docs, counts] = await Promise.all([listGovDocs(section), getSectionCounts()]);
  return NextResponse.json({ docs, counts });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const docId = await createGovDoc({ ...body, createdBy: session.userId });
  return NextResponse.json({ docId }, { status: 201 });
}
