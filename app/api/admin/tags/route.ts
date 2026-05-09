import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listTags, createTag } from "@/lib/queries/catalog";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await listTags());
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (!body.tagName?.trim()) return NextResponse.json({ error: "Tag name is required" }, { status: 400 });
  const id = await createTag({
    tagName:     body.tagName.trim(),
    parentTagId: body.parentTagId ?? null,
    colorHex:    body.colorHex ?? "#6058A0",
    description: body.description ?? "",
  });
  return NextResponse.json({ id }, { status: 201 });
}
