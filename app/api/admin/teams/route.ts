import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listTeams, createTeam } from "@/lib/queries/admin";

export async function GET() {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listTeams());
}

export async function POST(req: Request) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  if (!body.teamName) return NextResponse.json({ error: "teamName required" }, { status: 400 });

  const teamId = await createTeam(body.teamName, body.description ?? "");
  return NextResponse.json({ teamId }, { status: 201 });
}
