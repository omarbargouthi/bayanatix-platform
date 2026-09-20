import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { updateSitPattern, deleteSitPattern } from "@/lib/queries/sit-classification";

const PATTERN_TYPES = ["NAME_REGEX", "VALUE_REGEX", "CHECKSUM"] as const;
const CHECKSUM_ALGORITHMS = new Set(["LUHN", "IBAN_MOD97", "SA_NATIONAL_ID"]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patternId = Number(params.id);
  if (!Number.isFinite(patternId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const patternType = body.pattern_type as (typeof PATTERN_TYPES)[number] | undefined;
  const patternText = typeof body.pattern_text === "string" ? body.pattern_text.trim() : undefined;

  if (patternType && !PATTERN_TYPES.includes(patternType)) {
    return NextResponse.json({ error: `pattern_type must be one of ${PATTERN_TYPES.join(", ")}` }, { status: 400 });
  }
  if (patternText !== undefined) {
    if (!patternText) return NextResponse.json({ error: "pattern_text cannot be empty" }, { status: 400 });
    if (patternType === "CHECKSUM" && !CHECKSUM_ALGORITHMS.has(patternText)) {
      return NextResponse.json({ error: `CHECKSUM pattern_text must be one of ${[...CHECKSUM_ALGORITHMS].join(", ")}` }, { status: 400 });
    }
    if (patternType !== "CHECKSUM") {
      try { new RegExp(patternText); } catch (e) {
        return NextResponse.json({ error: `Invalid regular expression: ${(e as Error).message}` }, { status: 400 });
      }
    }
  }
  if (body.confidence_weight != null && !(Number(body.confidence_weight) > 0 && Number(body.confidence_weight) <= 1)) {
    return NextResponse.json({ error: "confidence_weight must be between 0 and 1" }, { status: 400 });
  }

  await updateSitPattern(patternId, {
    regionCode: body.region_code ?? undefined,
    patternType: patternType ?? undefined,
    patternText: patternText ?? undefined,
    confidenceWeight: body.confidence_weight != null ? Number(body.confidence_weight) : undefined,
    isEnabled: body.is_enabled != null ? Boolean(body.is_enabled) : undefined,
    notesText: "notes_text" in body ? body.notes_text : undefined,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const patternId = Number(params.id);
  if (!Number.isFinite(patternId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteSitPattern(patternId);
  return NextResponse.json({ ok: true });
}
