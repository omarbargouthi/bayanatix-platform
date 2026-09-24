import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateConnectionStatus } from "@/lib/queries/sources";
import { testConnection } from "@/lib/crawler";

type Params = { params: { id: string } };

export async function POST(_: Request, { params }: Params) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const connectionId = Number(params.id);
  const result = await testConnection(connectionId);
  await updateConnectionStatus(connectionId, result.ok ? "OK" : "FAILED");
  return NextResponse.json(result);
}
