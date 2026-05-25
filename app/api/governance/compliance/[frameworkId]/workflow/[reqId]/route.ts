import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkflow, advanceWorkflow } from "@/lib/queries/gov-compliance";

export async function GET(
  _req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workflow = await getWorkflow(Number(params.reqId));
  return NextResponse.json({ workflow });
}

export async function POST(
  req: Request,
  { params }: { params: { frameworkId: string; reqId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { action } = body;
  if (!["submit", "confirm", "endorse"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Use submit | confirm | endorse" }, { status: 400 });
  }

  await advanceWorkflow(
    Number(params.reqId),
    Number(params.frameworkId),
    action as "submit" | "confirm" | "endorse",
    session.fullName ?? session.userId
  );
  return NextResponse.json({ ok: true });
}
