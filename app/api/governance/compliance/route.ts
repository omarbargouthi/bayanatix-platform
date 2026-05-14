import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listFrameworks, createFramework } from "@/lib/queries/gov-compliance";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await listFrameworks());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name, code, version, description } = await req.json();
  const id = await createFramework(name, code, version ?? null, description ?? null);
  return NextResponse.json({ frameworkId: id }, { status: 201 });
}
