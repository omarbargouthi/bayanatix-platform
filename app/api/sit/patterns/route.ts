import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSitPatternsForType, createSitPattern } from "@/lib/queries/sit-classification";

const PATTERN_TYPES = ["NAME_REGEX", "VALUE_REGEX", "CHECKSUM"] as const;
const CHECKSUM_ALGORITHMS = new Set(["LUHN", "IBAN_MOD97", "SA_NATIONAL_ID"]);

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sitTypeId = Number(searchParams.get("sit_type_id"));
  if (!Number.isFinite(sitTypeId)) return NextResponse.json({ error: "sit_type_id is required" }, { status: 400 });

  return NextResponse.json(await getSitPatternsForType(sitTypeId));
}

// Pattern authoring is ADMIN-only — a bad regex or checksum key silently breaks
// detection for every column in every table, a much larger blast radius than
// canEditMetadata's steward-level term/data edits.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const sitTypeId = Number(body.sit_type_id);
  const regionCode = body.region_code as string;
  const patternType = body.pattern_type as (typeof PATTERN_TYPES)[number];
  const patternText = (body.pattern_text as string ?? "").trim();
  const confidenceWeight = Number(body.confidence_weight ?? 0.3);

  if (!Number.isFinite(sitTypeId)) return NextResponse.json({ error: "sit_type_id is required" }, { status: 400 });
  if (!regionCode) return NextResponse.json({ error: "region_code is required" }, { status: 400 });
  if (!PATTERN_TYPES.includes(patternType)) return NextResponse.json({ error: `pattern_type must be one of ${PATTERN_TYPES.join(", ")}` }, { status: 400 });
  if (!patternText) return NextResponse.json({ error: "pattern_text is required" }, { status: 400 });
  if (!(confidenceWeight > 0 && confidenceWeight <= 1)) return NextResponse.json({ error: "confidence_weight must be between 0 and 1" }, { status: 400 });

  if (patternType === "CHECKSUM" && !CHECKSUM_ALGORITHMS.has(patternText)) {
    return NextResponse.json({ error: `CHECKSUM pattern_text must be one of ${[...CHECKSUM_ALGORITHMS].join(", ")} — these are the only algorithms lib/sit-classifier.ts implements` }, { status: 400 });
  }
  if (patternType !== "CHECKSUM") {
    try { new RegExp(patternText); } catch (e) {
      return NextResponse.json({ error: `Invalid regular expression: ${(e as Error).message}` }, { status: 400 });
    }
  }

  const id = await createSitPattern({ sitTypeId, regionCode, patternType, patternText, confidenceWeight, notesText: body.notes_text ?? null });
  return NextResponse.json({ ok: true, patternId: id }, { status: 201 });
}
