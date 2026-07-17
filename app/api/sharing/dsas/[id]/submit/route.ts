import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { computeApprovalStations } from "@/lib/sharing-routing";

type Ctx = { params: { id: string } };

// Gate checks + transition DRAFT → OWNER_REVIEW
export async function POST(_req: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dsaId = Number(params.id);
  if (!Number.isFinite(dsaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const [dsa] = await sql`
    SELECT dsa_id, status_code, sharing_scope_code, direction_code,
           effective_start_date, effective_end_date, purpose_text,
           legal_basis_text, sharing_frequency_code, sharing_method_code,
           data_format_code, entity_role_code, is_cross_border,
           security_controls_text, storage_conditions_text,
           destruction_mechanism_text, liability_terms_text,
           risk_assessment_ref
    FROM bayanat.data_sharing_agreements
    WHERE dsa_id = ${dsaId}
  `;
  if (!dsa) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!["DRAFT","RENEWAL_DRAFT"].includes(dsa.status_code)) {
    return NextResponse.json({ error: "DSA is not in DRAFT status" }, { status: 409 });
  }

  const failures: string[] = [];

  // ── G-CB Cross-border hard block ──────────────────────────────────────────
  if (dsa.is_cross_border) {
    failures.push("G-CB: Cross-border data transfer is not permitted in v1. Remove the cross-border flag.");
  }

  // ── Mandatory fields ────────────────────────────────────���─────────────────
  if (!dsa.purpose_text)                  failures.push("Purpose is required.");
  if (!dsa.legal_basis_text)              failures.push("Legal basis is required.");
  if (!dsa.effective_start_date)          failures.push("Effective start date is required.");
  if (!dsa.effective_end_date)            failures.push("Effective end date is required.");
  if (!dsa.sharing_frequency_code)        failures.push("Sharing frequency is required.");
  if (!dsa.sharing_method_code)           failures.push("Sharing method is required.");
  if (!dsa.data_format_code)              failures.push("Data format is required.");
  if (!dsa.security_controls_text)        failures.push("Security controls description is required.");
  if (!dsa.storage_conditions_text)       failures.push("Storage conditions description is required.");
  if (!dsa.destruction_mechanism_text)    failures.push("Destruction mechanism is required.");
  if (!dsa.liability_terms_text)          failures.push("Liability terms are required.");
  if (dsa.sharing_scope_code !== "INTERNAL" && !dsa.risk_assessment_ref) {
    failures.push("G5: Risk assessment reference is required for external agreements.");
  }

  // ── G1: All attributes classified ────────────────────────────────────────
  const [unclassified] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.dsa_attributes da
    JOIN bayanat.dsa_datasets dd ON dd.dsa_dataset_id = da.dsa_dataset_id
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = da.attribute_id AND abt.term_role = 'CLASSIFICATION'
    WHERE dd.dsa_id = ${dsaId} AND abt.glossary_id IS NULL
  `;
  if (Number(unclassified.cnt) > 0) {
    failures.push(`G1: ${unclassified.cnt} attribute(s) have no classification assigned. Open Classification workspace to fix.`);
  }

  // ── G2: Owner assigned on all datasets ───────────────────────────────────
  const [noOwner] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.dsa_datasets dd
    WHERE dd.dsa_id = ${dsaId}
      AND NOT EXISTS (
        SELECT 1 FROM bayanat.asset_stakeholders s
        WHERE s.asset_type_code = 'DATA_ENTITIES' AND s.asset_id = dd.entity_id AND s.role_code = 'DATA_OWNER'
      )
  `;
  if (Number(noOwner.cnt) > 0) {
    failures.push(`G2: ${noOwner.cnt} dataset(s) have no Data Owner assigned. Assign owners in the Catalog.`);
  }

  // ── G4: PI scan completed ─���────────────────────────────────────���──────────
  const [noPiScan] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.dsa_attributes da
    JOIN bayanat.dsa_datasets dd ON dd.dsa_dataset_id = da.dsa_dataset_id
    JOIN bayanat.data_attributes a ON a.attribute_id = da.attribute_id
    WHERE dd.dsa_id = ${dsaId}
      AND a.is_pii IS NULL
  `;
  if (Number(noPiScan.cnt) > 0) {
    failures.push(`G4: ${noPiScan.cnt} attribute(s) have not been scanned for personal data. Complete PII tagging first.`);
  }

  // ── G6: No active legal hold ─────────────────���──────────────────────��─────
  const [holdConflict] = await sql`
    SELECT COUNT(*)::int AS cnt
    FROM bayanat.dsa_datasets dd
    JOIN bayanat.data_entities e ON e.entity_id = dd.entity_id
    JOIN bayanat.legal_hold_categories lhc ON lhc.category_id = e.retention_category_id
    JOIN bayanat.legal_holds lh ON lh.hold_id = lhc.hold_id AND lh.hold_status = 'ACTIVE'
    WHERE dd.dsa_id = ${dsaId}
  `;
  if (Number(holdConflict.cnt) > 0) {
    failures.push("G6: One or more datasets are under an active legal hold. Release the hold before sharing.");
  }

  if (failures.length > 0) {
    return NextResponse.json({ ok: false, failures }, { status: 422 });
  }

  // ── Compute max classification + PI indicator ─────────────���───────────────
  const [computed] = await sql`
    SELECT
      (SELECT ct.class_code
       FROM bayanat.dsa_attributes da
       JOIN bayanat.dsa_datasets dd ON dd.dsa_dataset_id = da.dsa_dataset_id
       JOIN bayanat.asset_business_terms abt
         ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = da.attribute_id AND abt.term_role = 'CLASSIFICATION'
       JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
       JOIN bayanat.classification_types ct ON ct.class_code = bg.classification_code
       WHERE dd.dsa_id = ${dsaId}
       ORDER BY ct.rank_order DESC NULLS LAST
       LIMIT 1
      ) AS max_class,
      EXISTS (
        SELECT 1
        FROM bayanat.dsa_attributes da
        JOIN bayanat.dsa_datasets dd ON dd.dsa_dataset_id = da.dsa_dataset_id
        JOIN bayanat.asset_business_terms abt
          ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = da.attribute_id AND abt.term_role = 'CLASSIFICATION'
        JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
        WHERE dd.dsa_id = ${dsaId} AND COALESCE(bg.is_pii_indicator, false) = true
      ) AS has_pii
  `;

  const maxClass = computed.max_class as string | null;
  const hasPii   = computed.has_pii as boolean;

  // ── Generate reference code ───────────────────────���───────────────────────
  const year = new Date().getFullYear();
  const [seqRow] = await sql`SELECT nextval('bayanat.dsa_ref_seq') AS seq`;
  const refCode = `DSA-${year}-${String(seqRow.seq).padStart(4, "0")}`;

  // ── Snapshot classification codes on dsa_attributes ───────────────────────
  await sql`
    UPDATE bayanat.dsa_attributes da
    SET
      classification_code_snapshot = bg.classification_code,
      is_personal_data_indicator   = COALESCE(bg.is_pii_indicator, false)
    FROM bayanat.dsa_datasets dd
    LEFT JOIN bayanat.asset_business_terms abt
      ON abt.asset_type_code = 'DATA_ATTRIBUTES' AND abt.asset_id = da.attribute_id AND abt.term_role = 'CLASSIFICATION'
    LEFT JOIN bayanat.business_glossaries bg ON bg.glossary_id = abt.glossary_id
    WHERE dd.dsa_id = ${dsaId} AND da.dsa_dataset_id = dd.dsa_dataset_id
  `;

  // ���─ Compute approval stations ─────────────────���───────────────────────────
  const stations = computeApprovalStations({
    sharingScopeCode:      dsa.sharing_scope_code,
    maxClassificationCode: maxClass,
    containsPersonalData:  hasPii,
  });

  // Delete any previous pending approvals, re-insert fresh
  await sql`DELETE FROM bayanat.dsa_approvals WHERE dsa_id = ${dsaId}`;
  for (const st of stations) {
    await sql`
      INSERT INTO bayanat.dsa_approvals (dsa_id, station_code, station_order, required_indicator)
      VALUES (${dsaId}, ${st.stationCode}, ${st.stationOrder}, ${st.required})
    `;
  }

  // ── Transition to OWNER_REVIEW ��───────────────────��───────────────────────
  await sql`
    UPDATE bayanat.data_sharing_agreements SET
      status_code                    = 'OWNER_REVIEW',
      max_classification_code        = ${maxClass},
      contains_personal_data_indicator = ${hasPii},
      dsa_reference_code             = ${refCode},
      submitted_at                   = NOW()
    WHERE dsa_id = ${dsaId}
  `;

  return NextResponse.json({ ok: true, refCode, maxClass, hasPii, stations });
}
