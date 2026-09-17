import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";
import { handleOwnershipOverridePOST } from "@/lib/queries/glossary-ownership";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return handleOwnershipOverridePOST(req, Number(params.id), session.userId, session.role);
}
