import { sql } from "../db";
import { createFramework } from "./gov-compliance";
import { syncRegulationFromRegistryEntry, syncRegistryEntryFromRegulation, uniqueRegulationCode, regulationOfRegistryEntry } from "./regulation-registry";

export type GovDoc = {
  docId:         number;
  sectionCode:   string;
  title:         string;
  description:   string | null;
  statusCode:    string;
  versionText:   string | null;
  effectiveDate: string | null;
  expiryDate:    string | null;
  ownerUserId:   string | null;
  ownerName:     string | null;
  sourceUrl:     string | null;
  /** Pinned to the Dashboard's announcements panel (db/178). */
  announce:      boolean;
  /** Roadmaps: the domain the roadmap is for (metadata, data quality, …). */
  domain:        string | null;
  // Roadmaps: the milestones and deliverables behind the execution status (db/182) —
  // all but the cancelled ones, those completed, in progress, and delayed or overdue.
  execTotal:     number;
  execCompleted: number;
  execStarted:   number;
  execLate:      number;
  createdAt:     string;
  updatedAt:     string;
  createdBy:     string | null;
  attachmentCount: number;
  // Regulatory entries only (db/163): the regulation this entry registers, and what the
  // Compliance / configuration pages know about it.
  frameworkId:      number | null;
  isApplicable:     boolean | null;
  regulatoryBody:   string | null;
  regionName:       string | null;
  countriesInScope: string | null;
  requirementCount: number | null;
};

export async function listGovDocs(sectionCode?: string): Promise<GovDoc[]> {
  return sql<GovDoc[]>`
    SELECT
      d.doc_id          AS "docId",
      d.section_code    AS "sectionCode",
      d.title,
      d.description,
      d.status_code     AS "statusCode",
      d.version_text    AS "versionText",
      d.effective_date::text AS "effectiveDate",
      d.expiry_date::text    AS "expiryDate",
      d.owner_user_id   AS "ownerUserId",
      u.full_name       AS "ownerName",
      d.source_url      AS "sourceUrl",
      d.announce_indicator AS "announce",
      d.domain_text     AS "domain",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code <> 'CANCELLED') AS "execTotal",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code = 'COMPLETED') AS "execCompleted",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code = 'IN_PROGRESS') AS "execStarted",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id
         AND (i.status_code = 'DELAYED' OR (i.due_date < current_date AND i.status_code NOT IN ('COMPLETED', 'CANCELLED')))) AS "execLate",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      d.created_by      AS "createdBy",
      COUNT(a.attachment_id)::int AS "attachmentCount",
      d.framework_id    AS "frameworkId",
      f.is_applicable_indicator AS "isApplicable",
      f.regulatory_body AS "regulatoryBody", f.region_name AS "regionName", f.countries_in_scope AS "countriesInScope",
      (SELECT count(*)::int FROM bayanat.gov_compliance_requirements r WHERE r.framework_id = d.framework_id) AS "requirementCount"
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.users u ON u.user_id = d.owner_user_id
    LEFT JOIN bayanat.gov_framework_attachments a ON a.doc_id = d.doc_id
    LEFT JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
    -- A regulation marked "not applicable to the organization" (configuration) is not
    -- shown in the registry either; ticking it again brings its entry back.
    WHERE (f.framework_id IS NULL OR f.is_applicable_indicator)
      ${sectionCode ? sql`AND d.section_code = ${sectionCode}` : sql``}
    GROUP BY d.doc_id, u.full_name, f.framework_id
    ORDER BY d.section_code, lower(d.title)
  `;
}

export async function getGovDoc(docId: number): Promise<GovDoc | null> {
  const rows = await sql<GovDoc[]>`
    SELECT
      d.doc_id          AS "docId",
      d.section_code    AS "sectionCode",
      d.title,
      d.description,
      d.status_code     AS "statusCode",
      d.version_text    AS "versionText",
      d.effective_date::text AS "effectiveDate",
      d.expiry_date::text    AS "expiryDate",
      d.owner_user_id   AS "ownerUserId",
      u.full_name       AS "ownerName",
      d.source_url      AS "sourceUrl",
      d.announce_indicator AS "announce",
      d.domain_text     AS "domain",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code <> 'CANCELLED') AS "execTotal",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code = 'COMPLETED') AS "execCompleted",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id AND i.status_code = 'IN_PROGRESS') AS "execStarted",
      (SELECT count(*)::int FROM bayanat.gov_roadmap_items i WHERE i.doc_id = d.doc_id
         AND (i.status_code = 'DELAYED' OR (i.due_date < current_date AND i.status_code NOT IN ('COMPLETED', 'CANCELLED')))) AS "execLate",
      d.created_at::text AS "createdAt",
      d.updated_at::text AS "updatedAt",
      d.created_by      AS "createdBy",
      COUNT(a.attachment_id)::int AS "attachmentCount",
      d.framework_id    AS "frameworkId",
      f.is_applicable_indicator AS "isApplicable",
      f.regulatory_body AS "regulatoryBody", f.region_name AS "regionName", f.countries_in_scope AS "countriesInScope",
      (SELECT count(*)::int FROM bayanat.gov_compliance_requirements r WHERE r.framework_id = d.framework_id) AS "requirementCount"
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.users u ON u.user_id = d.owner_user_id
    LEFT JOIN bayanat.gov_framework_attachments a ON a.doc_id = d.doc_id
    LEFT JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
    WHERE d.doc_id = ${docId}
    GROUP BY d.doc_id, u.full_name, f.framework_id
  `;
  return rows[0] ?? null;
}

export async function createGovDoc(data: {
  sectionCode: string; title: string; description?: string;
  statusCode?: string; versionText?: string; effectiveDate?: string;
  expiryDate?: string; ownerUserId?: string; sourceUrl?: string; announce?: boolean; domain?: string | null; createdBy: string;
}): Promise<number> {
  const rows = await sql<{ docId: number }[]>`
    INSERT INTO bayanat.gov_framework_docs
      (section_code, title, description, status_code, version_text, effective_date, expiry_date, owner_user_id, source_url, announce_indicator, domain_text, created_by)
    VALUES (
      ${data.sectionCode}, ${data.title}, ${data.description ?? null},
      ${data.statusCode ?? 'DRAFT'}, ${data.versionText ?? null},
      ${data.effectiveDate ?? null}, ${data.expiryDate ?? null},
      ${data.ownerUserId ?? null}, ${data.sourceUrl ?? null}, ${data.announce === true}, ${data.domain ?? null}, ${data.createdBy}
    )
    RETURNING doc_id AS "docId"
  `;
  const docId = rows[0].docId;
  // The Regulatory page is the registry of regulations and frameworks: an entry added
  // here is a regulation, so it is created as one (assessable on the Compliance page,
  // listed in the configuration) under the same name.
  if (data.sectionCode === "REGULATORY") {
    const frameworkId = await createFramework(
      data.title, await uniqueRegulationCode(data.title), data.versionText ?? null, data.description ?? null,
      "COMPLIANCE_ONLY", null, { registryDocId: docId, userId: data.createdBy },
    );
    await sql`
      UPDATE bayanat.gov_compliance_frameworks
      SET effective_date = ${data.effectiveDate ?? null}::date, official_url = ${data.sourceUrl ?? null}
      WHERE framework_id = ${frameworkId}
    `;
    await syncRegistryEntryFromRegulation(frameworkId, data.createdBy);
  }
  return docId;
}

export async function updateGovDoc(docId: number, data: {
  title?: string; description?: string; statusCode?: string;
  versionText?: string; effectiveDate?: string; expiryDate?: string;
  ownerUserId?: string; sourceUrl?: string; announce?: boolean; domain?: string | null;
}): Promise<void> {
  await sql`
    UPDATE bayanat.gov_framework_docs SET
      title          = COALESCE(${data.title ?? null}, title),
      description    = COALESCE(${data.description ?? null}, description),
      status_code    = COALESCE(${data.statusCode ?? null}, status_code),
      version_text   = COALESCE(${data.versionText ?? null}, version_text),
      effective_date = COALESCE(${data.effectiveDate ?? null}::date, effective_date),
      expiry_date    = COALESCE(${data.expiryDate ?? null}::date, expiry_date),
      owner_user_id  = COALESCE(${data.ownerUserId ?? null}, owner_user_id),
      source_url     = ${data.sourceUrl !== undefined ? data.sourceUrl : sql`source_url`},
      announce_indicator = ${typeof data.announce === "boolean" ? data.announce : sql`announce_indicator`},
      domain_text    = ${data.domain !== undefined ? data.domain : sql`domain_text`},
      updated_at     = NOW()
    WHERE doc_id = ${docId}
  `;
  // A Regulatory entry and its regulation share one name and one set of details.
  await syncRegulationFromRegistryEntry(docId);
}

export class RegulationInUseError extends Error {}

/** Deletes a document. A Regulatory entry takes its regulation with it — which is only
 *  allowed while that regulation has no requirements; one that does is hidden instead
 *  (configuration: not applicable), never deleted from here. */
export async function deleteGovDoc(docId: number): Promise<void> {
  const regulation = await regulationOfRegistryEntry(docId);
  if (regulation && regulation.requirementCount > 0) {
    throw new RegulationInUseError(
      `"${regulation.name}" has ${regulation.requirementCount} requirement(s) and cannot be deleted from the registry. To stop using it, mark it as not applicable in the configuration — it is then hidden from the Compliance page.`,
    );
  }
  await sql`DELETE FROM bayanat.gov_framework_docs WHERE doc_id = ${docId}`;
  if (regulation) {
    await sql`DELETE FROM bayanat.gov_compliance_level_config WHERE framework_id = ${regulation.frameworkId}`;
    await sql`DELETE FROM bayanat.compliance_config_items WHERE framework_id = ${regulation.frameworkId}`;
    await sql`DELETE FROM bayanat.gov_compliance_frameworks WHERE framework_id = ${regulation.frameworkId}`;
  }
}

export async function getSectionCounts(): Promise<Record<string, number>> {
  const rows = await sql<{ sectionCode: string; cnt: number }[]>`
    SELECT d.section_code AS "sectionCode", COUNT(*)::int AS cnt
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
    WHERE (f.framework_id IS NULL OR f.is_applicable_indicator) -- same rule as listGovDocs
    GROUP BY d.section_code
  `;
  return Object.fromEntries(rows.map((r) => [r.sectionCode, r.cnt]));
}

/** The sections switched off for the organization (db/182). They are left out of the
 *  framework pages and of the Dashboard's announcements; their documents are kept. */
export async function getHiddenSections(): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT section_code AS code FROM bayanat.gov_framework_section_settings WHERE hidden_indicator
  `;
  return rows.map((r) => r.code);
}

export async function setSectionHidden(sectionCode: string, hidden: boolean, userId: string): Promise<void> {
  await sql`
    INSERT INTO bayanat.gov_framework_section_settings (section_code, hidden_indicator, updated_by)
    VALUES (${sectionCode}, ${hidden}, ${userId})
    ON CONFLICT (section_code) DO UPDATE SET hidden_indicator = EXCLUDED.hidden_indicator, updated_by = EXCLUDED.updated_by, updated_at = now()
  `;
}
