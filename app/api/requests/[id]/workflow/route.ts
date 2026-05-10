import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getWorkflowForRequest, isStageActor } from "@/lib/queries/workflow";

type Params = { params: { id: string } };

export async function GET(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestId = Number(params.id);
  const [wf, actor] = await Promise.all([
    getWorkflowForRequest(requestId),
    isStageActor(requestId, session.userId),
  ]);

  if (!wf) return NextResponse.json(null);
  return NextResponse.json({ ...wf, isCurrentActor: actor });
}
