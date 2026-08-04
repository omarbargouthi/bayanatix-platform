import { sql } from "../db";
import type { SessionUser } from "../types";
import type { ReportFilters } from "./kpi-registry";

/**
 * Root business-domain glossary_ids this user is restricted to in Reports, or null
 * if unrestricted. Only STEWARD accounts can be restricted, and only once they have
 * at least one bayanat.glossary_stewards assignment — a steward with zero
 * assignments keeps today's unrestricted behavior rather than seeing nothing.
 */
export async function getStewardDomainScope(userId: string, role: SessionUser["role"]): Promise<number[] | null> {
  if (role !== "STEWARD") return null;
  const rows = await sql<{ glossaryId: number }[]>`
    SELECT DISTINCT gs.glossary_id AS "glossaryId"
    FROM   bayanat.glossary_stewards gs
    JOIN   bayanat.business_glossaries bg ON bg.glossary_id = gs.glossary_id AND bg.parent_glossary_id IS NULL
    WHERE  gs.user_id = ${userId}
  `;
  return rows.length > 0 ? rows.map((r) => r.glossaryId) : null;
}

/**
 * Forces the domain filter to a scoped steward's allowed domain, ignoring whatever
 * the client requested — this is the actual AC-7 enforcement point. If the steward
 * has more than one allowed domain, only the first is server-enforced (see plan notes
 * on scope of the multi-domain case); the UI additionally restricts the dropdown to
 * all of them via getStewardScopeInfo below.
 */
export async function applyStewardScope(session: SessionUser, filters: ReportFilters): Promise<ReportFilters> {
  const scope = await getStewardDomainScope(session.userId, session.role);
  if (scope === null) return filters;
  return { ...filters, domainGlossaryId: scope[0] };
}

export type StewardScopeInfo = { restricted: boolean; allowedDomainIds: number[] };

/** For server components building the filter-bar domain list. */
export async function getStewardScopeInfo(session: SessionUser): Promise<StewardScopeInfo> {
  const scope = await getStewardDomainScope(session.userId, session.role);
  return scope === null ? { restricted: false, allowedDomainIds: [] } : { restricted: true, allowedDomainIds: scope };
}
