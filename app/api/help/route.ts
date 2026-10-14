import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { helpIndex, searchHelp } from "@/lib/help/content";

// GET ?lang=ar — the Help Center's list of topics; with &q=… — search results.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const lang = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(searchParams.get("lang") ?? "") ? searchParams.get("lang")! : "en";
  const q = searchParams.get("q");
  if (q != null) return NextResponse.json({ results: await searchHelp(q, lang) });
  return NextResponse.json({ topics: await helpIndex(lang) });
}
