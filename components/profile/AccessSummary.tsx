"use client";

import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { UserAccessProfile } from "@/lib/queries/user-access";

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="card p-6">
      <h2 className="font-bold text-brand-deep mb-1">{title}</h2>
      <p className="text-[13px] text-muted mb-4">{description}</p>
      {children}
    </div>
  );
}

const Empty = ({ text }: { text: string }) => <p className="text-[13px] text-muted">{text}</p>;

// My Profile: the roles, teams and governance roles the signed-in user holds. Read-only —
// administrators assign these under Admin › Users & Roles and on each asset's stakeholders.
export function AccessSummary({ access }: { access: UserAccessProfile }) {
  const p = useLang().t.profile;
  const scopeTypes = p.scopeTypes as Record<string, string>;

  return (
    <>
      <Section title={p.rolesTitle} description={p.rolesDesc}>
        {access.roles.length === 0 ? <Empty text={p.noRoles} /> : (
          <ul className="divide-y divide-line">
            {access.roles.map((r, i) => (
              <li key={i} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{r.roleName}</div>
                  {r.description && <div className="text-[12px] text-muted">{r.description}</div>}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0 max-w-[55%]">
                  <span className="tag tag-gray" dir="auto">
                    {r.resourceType === "GLOBAL" ? scopeTypes.GLOBAL : `${scopeTypes[r.resourceType] ?? r.resourceType}: ${r.resourceName ?? ""}`}
                  </span>
                  {r.viaTeam && <span className="tag tag-blue" dir="auto">{p.viaTeam} {r.viaTeam}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.teamsTitle} description={p.teamsDesc}>
        {access.teams.length === 0 ? <Empty text={p.noTeams} /> : (
          <ul className="divide-y divide-line">
            {access.teams.map((tm) => (
              <li key={tm.teamId} className="py-2.5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink" dir="auto">{tm.teamName}</div>
                  {tm.description && <div className="text-[12px] text-muted" dir="auto">{tm.description}</div>}
                </div>
                <span className="text-[12px] text-muted shrink-0 tabular-nums">{tm.memberCount} {p.members}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.govTitle} description={p.govDesc}>
        {access.governed.length === 0 ? <Empty text={p.noGov} /> : (
          <div className="space-y-4">
            {access.governed.map((g) => (
              <div key={g.sourceId} className="rounded-lg border border-line">
                <div className="px-4 py-2.5 bg-gray-50 rounded-t-lg flex items-center justify-between gap-3">
                  <Link href={`/dashboard?source=${g.sourceId}`} className="text-sm font-bold text-brand-deep hover:text-brand-purple hover:underline truncate" dir="auto">{g.sourceName}</Link>
                  {g.typeCode && <span className="text-[11px] text-muted shrink-0">{g.typeCode}</span>}
                </div>
                <ul className="divide-y divide-line">
                  {g.assets.map((a, i) => (
                    <li key={i} className="px-4 py-2 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-muted shrink-0 w-14">{p.govLevels[a.level]}</span>
                        {a.level === "SOURCE" ? <span className="text-[13px] text-ink-soft">{p.govWholeSource}</span>
                          : (
                            <Link
                              href={a.level === "TABLE" ? `/catalog/${a.schemaId}/tables/${a.entityId}` : `/catalog/${a.schemaId}`}
                              className="text-[13px] text-ink hover:text-brand-purple hover:underline truncate" dir="ltr"
                            >{a.name}</Link>
                          )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
                        {a.roles.map((role) => <span key={role} className="tag tag-purple">{role}</span>)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
