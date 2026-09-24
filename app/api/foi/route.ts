import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isFoiStaff } from "@/lib/can";
import { listFoiRequests, getFoiStats } from "@/lib/queries/foi";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || !isFoiStaff(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const page   = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit  = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));

  const [{ rows, total }, stats] = await Promise.all([
    listFoiRequests({ status, search, page, limit }),
    getFoiStats(),
  ]);

  return NextResponse.json({ rows, total, page, limit, stats });
}
