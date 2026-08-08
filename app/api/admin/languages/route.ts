import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getLanguages, createLanguage } from "@/lib/queries/languages";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await getLanguages(true));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const languageCode = String(body.languageCode ?? "").trim().toLowerCase();
  const languageNameText = String(body.languageNameText ?? "").trim();
  const orientationCode = body.orientationCode === "RTL" ? "RTL" : "LTR";
  if (!languageCode || !languageNameText) {
    return NextResponse.json({ error: "languageCode and languageNameText are required" }, { status: 400 });
  }

  try {
    await createLanguage({ languageCode, languageNameText, orientationCode }, session.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create language";
    return NextResponse.json({ error: message.includes("duplicate") ? `Language "${languageCode}" already exists` : message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
