import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getDsa, getDsaDatasets, getDsaApprovals, getDsaAuthorizations } from "@/lib/queries/sharing";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [dsa, datasets, approvals, authorizations] = await Promise.all([
    getDsa(id),
    getDsaDatasets(id),
    getDsaApprovals(id),
    getDsaAuthorizations(id),
  ]);

  if (!dsa) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ dsa, datasets, approvals, authorizations });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = await req.json();

  // Only updatable in DRAFT / RENEWAL_DRAFT
  const [cur] = await sql`SELECT status_code FROM bayanat.data_sharing_agreements WHERE dsa_id = ${id}`;
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["DRAFT","RENEWAL_DRAFT"].includes(cur.status_code)) {
    return NextResponse.json({ error: "DSA is not editable in its current status" }, { status: 409 });
  }

  await sql`
    UPDATE bayanat.data_sharing_agreements SET
      title_text                     = COALESCE(${body.titleText              ?? null}, title_text),
      sharing_scope_code             = COALESCE(${body.sharingScopeCode       ?? null}, sharing_scope_code),
      direction_code                 = COALESCE(${body.directionCode          ?? null}, direction_code),
      counterparty_name_text         = ${body.counterpartyNameText    !== undefined ? (body.counterpartyNameText || null) : sql`counterparty_name_text`},
      counterparty_contact_json      = ${body.counterpartyContactJson !== undefined ? JSON.stringify(body.counterpartyContactJson) : sql`counterparty_contact_json`},
      purpose_text                   = ${body.purposeText             !== undefined ? (body.purposeText || null) : sql`purpose_text`},
      legal_basis_text               = ${body.legalBasisText          !== undefined ? (body.legalBasisText || null) : sql`legal_basis_text`},
      effective_start_date           = ${body.effectiveStartDate      !== undefined ? (body.effectiveStartDate || null) : sql`effective_start_date`},
      effective_end_date             = ${body.effectiveEndDate        !== undefined ? (body.effectiveEndDate || null) : sql`effective_end_date`},
      sharing_frequency_code         = ${body.sharingFrequencyCode    !== undefined ? (body.sharingFrequencyCode || null) : sql`sharing_frequency_code`},
      sharing_method_code            = ${body.sharingMethodCode       !== undefined ? (body.sharingMethodCode || null) : sql`sharing_method_code`},
      data_format_code               = ${body.dataFormatCode          !== undefined ? (body.dataFormatCode || null) : sql`data_format_code`},
      entity_role_code               = ${body.entityRoleCode          !== undefined ? (body.entityRoleCode || null) : sql`entity_role_code`},
      is_cross_border                = COALESCE(${body.isCrossBorder  !== undefined ? body.isCrossBorder : null}, is_cross_border),
      from_department_text           = ${body.fromDepartmentText !== undefined ? (body.fromDepartmentText || null) : sql`from_department_text`},
      to_department_text             = ${body.toDepartmentText   !== undefined ? (body.toDepartmentText   || null) : sql`to_department_text`},
      security_controls_text         = ${body.securityControlsText    !== undefined ? (body.securityControlsText || null) : sql`security_controls_text`},
      storage_conditions_text        = ${body.storageConditionsText   !== undefined ? (body.storageConditionsText || null) : sql`storage_conditions_text`},
      destruction_mechanism_text     = ${body.destructionMechanismText!== undefined ? (body.destructionMechanismText || null) : sql`destruction_mechanism_text`},
      liability_terms_text           = ${body.liabilityTermsText      !== undefined ? (body.liabilityTermsText || null) : sql`liability_terms_text`},
      review_terms_text              = ${body.reviewTermsText         !== undefined ? (body.reviewTermsText || null) : sql`review_terms_text`},
      risk_assessment_ref            = ${body.riskAssessmentRef       !== undefined ? (body.riskAssessmentRef || null) : sql`risk_assessment_ref`},
      signed_document_ref            = ${body.signedDocumentRef       !== undefined ? (body.signedDocumentRef || null) : sql`signed_document_ref`}
    WHERE dsa_id = ${id}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = Number(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [cur] = await sql`SELECT status_code, created_by FROM bayanat.data_sharing_agreements WHERE dsa_id = ${id}`;
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["DRAFT","RENEWAL_DRAFT"].includes(cur.status_code)) {
    return NextResponse.json({ error: "Only draft agreements can be deleted" }, { status: 409 });
  }
  // Admin can delete any draft; others can only delete their own
  if (session.role !== "ADMIN" && cur.created_by !== session.userId) {
    return NextResponse.json({ error: "You can only delete your own agreements" }, { status: 403 });
  }

  await sql`DELETE FROM bayanat.data_sharing_agreements WHERE dsa_id = ${id}`;
  return NextResponse.json({ ok: true });
}
