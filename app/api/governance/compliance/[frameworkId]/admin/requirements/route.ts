import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listRequirements } from "@/lib/queries/gov-compliance";

export async function GET(
  req: Request,
  { params }: { params: { frameworkId: string } }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const domain   = searchParams.get("domain");
  const standard = searchParams.get("standard");
  const q        = searchParams.get("q")?.toLowerCase() ?? "";

  let reqs = await listRequirements(Number(params.frameworkId));

  if (domain)   reqs = reqs.filter((r) => (r.domain ?? "Other") === domain);
  if (standard) reqs = reqs.filter((r) => r.standard === standard || r.standardCode === standard);
  if (q)        reqs = reqs.filter(
    (r) => r.reqCode.toLowerCase().includes(q) ||
           r.question.toLowerCase().includes(q) ||
           (r.domain ?? "").toLowerCase().includes(q)
  );

  return NextResponse.json({ requirements: reqs });
}
