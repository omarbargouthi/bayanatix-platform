import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addTeamMember, removeTeamMember, getUserById, nonReadOnlyRolesOfTeam } from "@/lib/queries/admin";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  // A Viewer can only hold read-only roles — including the ones a team would give them.
  const target = await getUserById(String(userId));
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (target.systemRole === "VIEWER") {
    const held = await nonReadOnlyRolesOfTeam(Number(params.id));
    if (held.length > 0) {
      return NextResponse.json({
        code: "VIEWER_SYSTEM_ROLE",
        error: `${target.fullName}'s system role is Viewer, which is read-only, and this team holds roles that can edit or manage: ${held.join(", ")}. Change the user's system role first.`,
      }, { status: 409 });
    }
  }

  await addTeamMember(Number(params.id), userId);
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await getSession();
  if (!user || user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  await removeTeamMember(Number(params.id), userId);
  return NextResponse.json({ ok: true });
}
