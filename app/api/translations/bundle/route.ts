import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTranslationBundle } from "@/lib/queries/translations";

/** Flattened key->value bundle for one language, for lang-context.tsx to overlay onto the English base object (spec FR-4.3). */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const lang = new URL(req.url).searchParams.get("lang");
  if (!lang) return NextResponse.json({ error: "Missing lang query param" }, { status: 400 });

  const bundle = await getTranslationBundle(lang);
  return NextResponse.json({ bundle });
}
