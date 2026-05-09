import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getThreadById } from "@/lib/queries/collaboration";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const data = await getThreadById(Number(params.id));
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
