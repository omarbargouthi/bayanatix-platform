import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDqDimensions } from "@/lib/queries/dq";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dims = await getDqDimensions();
  return NextResponse.json(dims);
}
