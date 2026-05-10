import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateConnectionStatus } from "@/lib/queries/sources";
import { testConnection } from "@/lib/crawler";

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const connectionId = Number(params.id);
  const result = await testConnection(connectionId);
  await updateConnectionStatus(connectionId, result.ok ? "OK" : "FAILED");
  return NextResponse.json(result);
}
