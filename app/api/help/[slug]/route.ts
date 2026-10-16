import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { helpDoc } from "@/lib/help/content";

// GET ?lang=ar — one Help Center document in the reader's language.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const raw = new URL(req.url).searchParams.get("lang") ?? "";
  const lang = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(raw) ? raw : "en";
  const doc = await helpDoc(params.slug, lang, session.role === "ADMIN");
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ doc });
}
