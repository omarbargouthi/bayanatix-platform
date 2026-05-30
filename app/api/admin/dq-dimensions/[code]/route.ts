import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Params = { params: { code: string } };

export async function PATCH(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "STEWARD")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: {
    nameEn?:    string | null;
    nameAr?:    string | null;
    descEn?:    string | null;
    descAr?:    string | null;
  } = await req.json();

  await sql`
    UPDATE bayanat.dq_dimensions
    SET
      dimension_name_text = COALESCE(${body.nameEn ?? null}, dimension_name_text),
      name_ar_text        = ${body.nameAr ?? null},
      description_text    = COALESCE(${body.descEn ?? null}, description_text),
      description_ar_text = ${body.descAr ?? null}
    WHERE dimension_code = ${params.code}
  `;

  return NextResponse.json({ ok: true });
}
