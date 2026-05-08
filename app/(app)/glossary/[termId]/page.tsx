import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getGlossaryTermById } from "@/lib/queries/glossary";
import { Tag } from "@/components/ui/Tag";
import { IconGlossary, IconTable, IconLines } from "@/components/layout/icons";

export const dynamic = "force-dynamic";

const CLASS_STYLE: Record<string, string> = {
  PUBLIC:       "bg-emerald-50 text-emerald-700 border border-emerald-200",
  INTERNAL:     "bg-blue-50   text-blue-700   border border-blue-200",
  CONFIDENTIAL: "bg-amber-50  text-amber-700  border border-amber-200",
  RESTRICTED:   "bg-red-50    text-red-700    border border-red-200",
  SECRET:       "bg-purple-50 text-purple-700 border border-purple-200",
};

function ClassBadge({ code }: { code: string | null }) {
  if (!code) return null;
  const style = CLASS_STYLE[code.toUpperCase()] ?? "bg-gray-50 text-gray-600 border border-gray-200";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold ${style}`}>
      {code.charAt(0) + code.slice(1).toLowerCase()}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-brand-deep mb-3 pb-2.5 border-b border-line-soft">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-line-soft last:border-b-0">
      <dt className="text-[11px] uppercase tracking-wider text-muted w-28 shrink-0 pt-0.5">{label}</dt>
      <dd className="flex-1 text-sm text-ink">{children}</dd>
    </div>
  );
}

export default async function GlossaryTermPage({
  params,
}: {
  params: { termId: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const id = Number(params.termId);
  if (!Number.isFinite(id)) notFound();

  const term = await getGlossaryTermById(id);
  if (!term) notFound();

  const classStyle = term.classCode
    ? CLASS_STYLE[term.classCode.toUpperCase()] ?? ""
    : "";

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat",           href: "/dashboard" },
          { label: "Business Glossary", href: "/glossary" },
          ...(term.domainName
            ? [{ label: term.domainName, href: `/glossary?domain=${term.domainId}` }]
            : []),
          { label: term.termName },
        ]}
        user={user}
      />

      <main className="px-8 py-7 pb-14">

        {/* ── Hero ── */}
        <div className="rounded-xl border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-6 mb-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                {term.domainName && (
                  <Tag variant="blue">{term.domainName}</Tag>
                )}
                {term.classCode && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-semibold ${classStyle}`}>
                    {term.classCode.charAt(0) + term.classCode.slice(1).toLowerCase()}
                  </span>
                )}
                {term.isPii && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[12px] font-semibold bg-red-50 text-red-700 border border-red-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    PII
                  </span>
                )}
              </div>

              <h1 className="text-3xl font-extrabold text-brand-deep flex items-center gap-3">
                <IconGlossary className="w-7 h-7 text-brand-purple shrink-0" />
                {term.termName}
              </h1>

              {term.aliases.length > 0 && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-[11px] text-muted uppercase tracking-wider">Also known as:</span>
                  {term.aliases.map((a) => (
                    <span key={a} className="tag">{a}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button className="btn btn-sm">★ Follow</button>
              <button className="btn btn-sm">Edit</button>
              <button className="btn btn-primary btn-sm">Request Change</button>
            </div>
          </div>
        </div>

        {/* ── Two-column body ── */}
        <div className="grid grid-cols-[1fr_300px] gap-6">

          {/* Left: content */}
          <div className="space-y-5">

            {/* Definition */}
            <Section title="Definition">
              <p className="text-[14px] text-ink leading-relaxed">{term.definition}</p>
            </Section>

            {/* Business Rules */}
            {term.businessRules && (
              <Section title="Business Rules">
                <div className="space-y-2">
                  {term.businessRules.split(/\.\s+/).filter(Boolean).map((rule, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-brand-purple/10 text-brand-purple text-[10px] font-bold grid place-items-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-[13px] text-ink-soft leading-snug">{rule}.</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Format & Example */}
            {(term.format || term.example) && (
              <Section title="Format &amp; Example">
                <div className="grid grid-cols-2 gap-4">
                  {term.format && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Format</div>
                      <code className="block bg-canvas-soft border border-line rounded-md px-4 py-3 text-[13px] font-mono text-brand-deep">
                        {term.format}
                      </code>
                    </div>
                  )}
                  {term.example && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted mb-2">Example Value</div>
                      <div className="bg-canvas-soft border border-line rounded-md px-4 py-3 text-[13px] text-ink-soft leading-snug">
                        {term.example}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {/* Linked Attributes */}
            {term.linkedAttributes.length > 0 && (
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
                  <h3 className="font-bold text-sm">
                    Linked Attributes
                    <span className="text-muted text-xs font-normal ml-2">
                      {term.linkedAttributes.length} column{term.linkedAttributes.length !== 1 ? "s" : ""}
                    </span>
                  </h3>
                </div>
                <div className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                  <div>Column</div>
                  <div>Table</div>
                  <div>Type</div>
                  <div>Classification</div>
                </div>
                {term.linkedAttributes.map((a) => (
                  <Link
                    key={a.attributeId}
                    href={`/catalog/${a.schemaId}/tables/${a.entityId}`}
                    className="grid grid-cols-[1.4fr_1.4fr_1fr_1fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-brand-deep">
                      <IconLines className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                      {a.physicalName}
                      {a.friendlyName && (
                        <span className="text-muted font-normal text-[11px]">({a.friendlyName})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-ink-soft">
                      <IconTable className="w-3.5 h-3.5 shrink-0" />
                      {a.entityName}
                    </div>
                    <div className="font-mono text-[12px] text-ink-soft">{a.dataType}</div>
                    <div><ClassBadge code={a.classCode} /></div>
                  </Link>
                ))}
              </div>
            )}

          </div>

          {/* Right: properties sidebar */}
          <aside className="space-y-5">

            <Section title="Properties">
              <dl className="divide-y divide-line-soft">
                <PropRow label="Domain">
                  {term.domainName
                    ? <Link href={`/glossary?domain=${term.domainId}`} className="text-brand-purple hover:underline font-medium">{term.domainName}</Link>
                    : <span className="text-muted">—</span>}
                </PropRow>
                <PropRow label="Classification">
                  {term.classCode ? <ClassBadge code={term.classCode} /> : <span className="text-muted">—</span>}
                </PropRow>
                <PropRow label="PII">
                  {term.isPii
                    ? <span className="text-red-600 font-semibold text-[12px]">Yes — Personal Data</span>
                    : <span className="text-emerald-600 font-semibold text-[12px]">No</span>}
                </PropRow>
                {term.piCategory && (
                  <PropRow label="PI Category">
                    <span className="text-ink text-[12px]">{term.piCategory}</span>
                  </PropRow>
                )}
                {term.npiCategory && (
                  <PropRow label="NPI Category">
                    <span className="text-ink text-[12px]">{term.npiCategory}</span>
                  </PropRow>
                )}
                <PropRow label="Created">
                  <span className="text-ink-soft text-[12px]">
                    {term.createdAt ? new Date(term.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit", month: "short", year: "numeric",
                    }) : "—"}
                  </span>
                </PropRow>
                <PropRow label="Linked Cols">
                  <span className="font-semibold text-brand-deep">{term.linkedAttributes.length}</span>
                </PropRow>
              </dl>
            </Section>

            {term.aliases.length > 0 && (
              <Section title={`Aliases (${term.aliases.length})`}>
                <div className="flex flex-wrap gap-1.5">
                  {term.aliases.map((a) => (
                    <span key={a} className="tag">{a}</span>
                  ))}
                </div>
              </Section>
            )}

            {term.linkedAttributes.length === 0 && (
              <Section title="Linked Attributes">
                <div className="text-center py-6 text-muted text-sm">
                  <IconLines className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No columns linked yet
                </div>
              </Section>
            )}

          </aside>
        </div>
      </main>
    </>
  );
}
