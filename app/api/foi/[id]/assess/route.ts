import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";

type Ctx = { params: { id: string } };

export async function POST(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const effortDays = Number(body.estimatedEffortDays);
  if (!Number.isFinite(effortDays) || effortDays <= 0) {
    return NextResponse.json({ error: "estimatedEffortDays must be a positive number" }, { status: 400 });
  }

  try {
    // Upsert assessment (one per request)
    await sql`
      INSERT INTO bayanat.foi_assessments
        (foi_request_id, eligibility_code, complexity_code,
         estimated_columns_count, estimated_sources_count, estimated_effort_days,
         involved_entities_json, already_public_link_text, notes_text,
         payment_exempt, exemption_reason, exemption_evidence_ref,
         assessed_by_user_id, assessed_at)
      VALUES (
        ${id},
        ${body.eligibilityCode ?? 'ELIGIBLE'},
        ${body.complexityCode ?? 'MEDIUM'},
        ${body.estimatedColumns != null ? Number(body.estimatedColumns) : null},
        ${body.estimatedSources != null ? Number(body.estimatedSources) : null},
        ${effortDays},
        ${body.involvedEntities ? JSON.stringify(body.involvedEntities) : null},
        ${body.alreadyPublicLink?.trim() || null},
        ${body.notes?.trim() || null},
        ${body.paymentExempt === true},
        ${body.exemptionReason?.trim() || null},
        ${body.exemptionEvidenceRef?.trim() || null},
        ${session.userId},
        NOW()
      )
      ON CONFLICT (foi_request_id) DO UPDATE SET
        eligibility_code          = EXCLUDED.eligibility_code,
        complexity_code           = EXCLUDED.complexity_code,
        estimated_columns_count   = EXCLUDED.estimated_columns_count,
        estimated_sources_count   = EXCLUDED.estimated_sources_count,
        estimated_effort_days     = EXCLUDED.estimated_effort_days,
        involved_entities_json    = EXCLUDED.involved_entities_json,
        already_public_link_text  = EXCLUDED.already_public_link_text,
        notes_text                = EXCLUDED.notes_text,
        payment_exempt            = EXCLUDED.payment_exempt,
        exemption_reason          = EXCLUDED.exemption_reason,
        exemption_evidence_ref    = EXCLUDED.exemption_evidence_ref,
        assessed_by_user_id       = EXCLUDED.assessed_by_user_id,
        assessed_at               = NOW()
    `;

    // Move request to ASSESSMENT status if it was in TRIAGE
    await sql`
      UPDATE bayanat.foi_requests SET
        status_code = CASE WHEN status_code IN ('TRIAGE','SUBMITTED') THEN 'ASSESSMENT' ELSE status_code END,
        updated_at = NOW()
      WHERE foi_request_id = ${id}
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[FOI ASSESS]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Server error" }, { status: 500 });
  }
}
