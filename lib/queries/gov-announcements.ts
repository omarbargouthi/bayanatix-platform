// What the Dashboard's "Announcements" panel advertises from the Governance Framework:
// milestones (Roadmap), training material, policies, procedures and the like.
//
// A document is announced when any of these holds (archived documents never are):
//   * it is pinned ("Show on the dashboard" in its form — db/178);
//   * it comes into effect within the next UPCOMING_DAYS days — an upcoming event;
//   * it was approved and came into effect (or, with no effective date, was last
//     changed) within the last RECENT_DAYS days — newly published. Regulatory entries
//     are left out of this last rule: they mirror the regulation registry, and their
//     change date is a synchronisation date, not a publication date.
import { sql } from "../db";

export const UPCOMING_DAYS = 90;
export const RECENT_DAYS = 30;

export type GovAnnouncement = {
  docId:         number;
  sectionCode:   string;
  title:         string;
  description:   string | null;
  statusCode:    string;
  versionText:   string | null;
  effectiveDate: string | null;
  /** Comes into effect after today. */
  isUpcoming:    boolean;
  isPinned:      boolean;
  attachmentCount: number;
};

export async function getGovAnnouncements(limit = 8): Promise<GovAnnouncement[]> {
  return sql<GovAnnouncement[]>`
    SELECT
      d.doc_id AS "docId", d.section_code AS "sectionCode", d.title, d.description,
      d.status_code AS "statusCode", d.version_text AS "versionText",
      d.effective_date::text AS "effectiveDate",
      (d.effective_date > current_date) AS "isUpcoming",
      d.announce_indicator AS "isPinned",
      (SELECT count(*)::int FROM bayanat.gov_framework_attachments a WHERE a.doc_id = d.doc_id) AS "attachmentCount"
    FROM bayanat.gov_framework_docs d
    LEFT JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
    WHERE d.status_code <> 'ARCHIVED'
      AND (f.framework_id IS NULL OR f.is_applicable_indicator)
      AND (
        d.announce_indicator
        OR d.effective_date BETWEEN current_date + 1 AND current_date + ${UPCOMING_DAYS}::int
        OR (d.status_code = 'APPROVED' AND d.section_code <> 'REGULATORY'
            AND coalesce(d.effective_date, d.updated_at::date) BETWEEN current_date - ${RECENT_DAYS}::int AND current_date)
      )
    ORDER BY
      (d.effective_date > current_date) DESC,                                   -- upcoming first,
      CASE WHEN d.effective_date > current_date THEN d.effective_date END ASC,   -- soonest first;
      coalesce(d.effective_date, d.updated_at::date) DESC,                       -- then the latest.
      d.title
    LIMIT ${limit}
  `;
}
