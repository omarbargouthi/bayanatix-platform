// What the Dashboard's "Announcements" panel advertises from the Governance Framework:
// scheduled events of the Communication Plan, roadmap milestones and deliverables,
// training material, policies, procedures and the like. Nothing from a hidden section.
//
// A document is announced when any of these holds (archived documents never are):
//   * it is pinned ("Show on the dashboard" in its form — db/178);
//   * it comes into effect within the next UPCOMING_DAYS days — an upcoming event;
//   * it was approved and came into effect (or, with no effective date, was last
//     changed) within the last RECENT_DAYS days — newly published. Regulatory entries
//     are left out of this last rule: they mirror the regulation registry, and their
//     change date is a synchronisation date, not a publication date.
//
// A Communication Plan event (db/182) is announced while it is planned, has "Show on the
// dashboard" ticked (the default) and takes place — or is still running — from today to
// UPCOMING_DAYS days ahead.
//
// A roadmap milestone or deliverable (db/182) with "Show on the dashboard" ticked is
// announced when it is due within UPCOMING_DAYS days or became overdue in the last
// RECENT_DAYS days, and for RECENT_DAYS days after it is completed.
import { sql } from "../db";
import { getHiddenSections } from "./gov-framework";

export const UPCOMING_DAYS = 90;
export const RECENT_DAYS = 30;

export type GovAnnouncement = {
  key:         string;
  kind:        "DOC" | "EVENT" | "ITEM";
  /** The framework section it belongs to (and links to). */
  sectionCode: string;
  /** DOC: the section code; EVENT: the event type; ITEM: MILESTONE or DELIVERABLE. */
  typeCode:    string;
  title:       string;
  description: string | null;
  /** The document, event or item status. */
  statusCode:  string;
  versionText: string | null;
  /** DOC: effective date; EVENT: its date; ITEM: completion date once completed, else due date. */
  date:        string | null;
  endDate:     string | null;
  timeText:    string | null;
  location:    string | null;
  /** ITEM: the roadmap it belongs to. */
  context:     string | null;
  /** Lies ahead: not yet in effect, not yet held, not yet due. */
  isUpcoming:  boolean;
  isPinned:    boolean;
  attachmentCount: number;
};

export async function getGovAnnouncements(limit = 8): Promise<GovAnnouncement[]> {
  const hidden = await getHiddenSections();
  const none: GovAnnouncement[] = [];

  const [docs, events, items] = await Promise.all([
    sql<GovAnnouncement[]>`
      SELECT
        'doc-' || d.doc_id AS key, 'DOC' AS kind, d.section_code AS "sectionCode", d.section_code AS "typeCode",
        d.title, d.description, d.status_code AS "statusCode", d.version_text AS "versionText",
        d.effective_date::text AS date, NULL AS "endDate", NULL AS "timeText", NULL AS location, NULL AS context,
        coalesce(d.effective_date > current_date, false) AS "isUpcoming",
        d.announce_indicator AS "isPinned",
        (SELECT count(*)::int FROM bayanat.gov_framework_attachments a WHERE a.doc_id = d.doc_id) AS "attachmentCount"
      FROM bayanat.gov_framework_docs d
      LEFT JOIN bayanat.gov_compliance_frameworks f ON f.framework_id = d.framework_id
      WHERE d.status_code <> 'ARCHIVED'
        AND d.section_code <> ALL(${hidden}::text[])
        AND (f.framework_id IS NULL OR f.is_applicable_indicator)
        AND (
          d.announce_indicator
          OR d.effective_date BETWEEN current_date + 1 AND current_date + ${UPCOMING_DAYS}::int
          OR (d.status_code = 'APPROVED' AND d.section_code <> 'REGULATORY'
              AND coalesce(d.effective_date, d.updated_at::date) BETWEEN current_date - ${RECENT_DAYS}::int AND current_date)
        )
    `,
    hidden.includes("COMMUNICATION") ? none : sql<GovAnnouncement[]>`
      SELECT
        'event-' || e.event_id AS key, 'EVENT' AS kind, 'COMMUNICATION' AS "sectionCode", e.event_type_code AS "typeCode",
        e.title, e.description, e.status_code AS "statusCode", NULL AS "versionText",
        e.event_date::text AS date, e.end_date::text AS "endDate", e.time_text AS "timeText", e.location_text AS location, NULL AS context,
        true AS "isUpcoming", true AS "isPinned", 0 AS "attachmentCount"
      FROM bayanat.gov_comm_events e
      WHERE e.status_code = 'PLANNED' AND e.announce_indicator
        AND coalesce(e.end_date, e.event_date) >= current_date
        AND e.event_date <= current_date + ${UPCOMING_DAYS}::int
    `,
    hidden.includes("ROADMAP") ? none : sql<GovAnnouncement[]>`
      SELECT
        'item-' || i.item_id AS key, 'ITEM' AS kind, 'ROADMAP' AS "sectionCode", i.item_type_code AS "typeCode",
        i.title, i.description, i.status_code AS "statusCode", NULL AS "versionText",
        (CASE WHEN i.status_code = 'COMPLETED' THEN coalesce(i.completed_date, i.due_date) ELSE i.due_date END)::text AS date,
        NULL AS "endDate", NULL AS "timeText", NULL AS location,
        d.title || coalesce(' · ' || nullif(d.domain_text, ''), '') AS context,
        (i.status_code <> 'COMPLETED' AND i.due_date >= current_date) AS "isUpcoming", true AS "isPinned", 0 AS "attachmentCount"
      FROM bayanat.gov_roadmap_items i
      JOIN bayanat.gov_framework_docs d ON d.doc_id = i.doc_id
      WHERE i.announce_indicator AND d.status_code <> 'ARCHIVED' AND i.status_code <> 'CANCELLED'
        AND (
          (i.status_code <> 'COMPLETED' AND i.due_date BETWEEN current_date - ${RECENT_DAYS}::int AND current_date + ${UPCOMING_DAYS}::int)
          OR (i.status_code = 'COMPLETED' AND coalesce(i.completed_date, i.due_date) >= current_date - ${RECENT_DAYS}::int)
        )
    `,
  ]);

  // Upcoming first, soonest first; then what has happened, latest first.
  const all = [...docs, ...events, ...items];
  all.sort((a, b) =>
    Number(b.isUpcoming) - Number(a.isUpcoming)
    || (a.isUpcoming ? (a.date ?? "9999").localeCompare(b.date ?? "9999") : (b.date ?? "").localeCompare(a.date ?? ""))
    || a.title.localeCompare(b.title));
  return all.slice(0, limit);
}
