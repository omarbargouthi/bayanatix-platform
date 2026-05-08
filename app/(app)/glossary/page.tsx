import { redirect } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { getSession } from "@/lib/auth";
import { getGlossaryStats, getGlossaryDomains, getGlossaryTerms } from "@/lib/queries/glossary";
import { Tag } from "@/components/ui/Tag";
import { IconGlossary, IconBook } from "@/components/layout/icons";

export const dynamic = "force-dynamic";

const CLASS_STYLE: Record<string, string> = {
  PUBLIC:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  INTERNAL:     "bg-blue-50   text-blue-700   border-blue-200",
  CONFIDENTIAL: "bg-amber-50  text-amber-700  border-amber-200",
  RESTRICTED:   "bg-red-50    text-red-700    border-red-200",
  SECRET:       "bg-purple-50 text-purple-700 border-purple-200",
};

function ClassBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-muted text-xs">—</span>;
  const style = CLASS_STYLE[code.toUpperCase()] ?? "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${style}`}>
      {code.charAt(0) + code.slice(1).toLowerCase()}
    </span>
  );
}

function PiiBadge({ isPii }: { isPii: boolean }) {
  if (!isPii) return <span className="text-muted text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
      PII
    </span>
  );
}

export default async function GlossaryPage({
  searchParams,
}: {
  searchParams: { domain?: string };
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  const domainFilter = searchParams.domain ? Number(searchParams.domain) : undefined;

  const [stats, domains, terms] = await Promise.all([
    getGlossaryStats(),
    getGlossaryDomains(),
    getGlossaryTerms(domainFilter),
  ]);

  const activeDomain = domainFilter
    ? domains.find((d) => d.glossaryId === domainFilter)
    : null;

  return (
    <>
      <Header
        crumbs={[
          { label: "Bayanat", href: "/dashboard" },
          { label: "Business Glossary" },
        ]}
        user={user}
      />

      <main className="px-8 py-7 pb-14">
        {/* Page header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold flex items-center gap-2.5 text-brand-deep">
            <IconGlossary className="w-6 h-6 text-brand-purple" />
            Business Glossary
          </h1>
          <div className="flex items-center gap-2">
            <button className="btn btn-sm">Export</button>
            <button className="btn btn-primary btn-sm">+ New Term</button>
          </div>
        </div>
        <p className="text-ink-soft text-sm mb-7 max-w-2xl">
          Authoritative definitions, business rules, and data lineage for all enterprise data concepts.
          Linked directly to physical columns in the data catalog.
        </p>

        {/* Stats row */}
        <section className="grid grid-cols-4 gap-4 mb-7">
          <StatCard label="Total Terms"       value={stats.totalTerms}   color="purple" />
          <StatCard label="Domains"           value={stats.domains}      color="blue" />
          <StatCard label="Linked Attributes" value={stats.linkedAttrs}  color="green" />
          <StatCard label="PII Terms"         value={stats.piiTerms}     color="red" />
        </section>

        {/* Two-column layout */}
        <div className="grid grid-cols-[260px_1fr] gap-6">

          {/* Left: domain tree */}
          <aside className="card p-3.5 self-start sticky top-24">
            <h4 className="text-[11px] uppercase tracking-wider text-muted px-3 pb-2.5">Domains</h4>
            <Link
              href="/glossary"
              className={[
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                !domainFilter
                  ? "bg-brand-purple/10 text-brand-deep font-semibold shadow-[inset_3px_0_0_#6058A0]"
                  : "text-ink-soft hover:bg-canvas hover:text-ink",
              ].join(" ")}
            >
              <IconBook className="w-4 h-4 shrink-0" />
              <span className="flex-1">All Terms</span>
              <span className="text-[11px] text-muted">{stats.totalTerms}</span>
            </Link>
            {domains.map((d) => (
              <Link
                key={d.glossaryId}
                href={`/glossary?domain=${d.glossaryId}`}
                className={[
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  domainFilter === d.glossaryId
                    ? "bg-brand-purple/10 text-brand-deep font-semibold shadow-[inset_3px_0_0_#6058A0]"
                    : "text-ink-soft hover:bg-canvas hover:text-ink",
                ].join(" ")}
              >
                <span className="w-2 h-2 rounded-full bg-brand-purple/50 shrink-0" />
                <span className="flex-1 truncate">{d.termName}</span>
                {d.termCount > 0 && (
                  <span className="text-[11px] text-muted">{d.termCount}</span>
                )}
              </Link>
            ))}
          </aside>

          {/* Right: terms table */}
          <section>
            {activeDomain && (
              <div className="rounded-lg border border-line bg-gradient-to-br from-[#f5f5ff] to-[#ecedf9] p-5 mb-5">
                <h2 className="text-lg font-bold text-brand-deep mb-1">{activeDomain.termName}</h2>
                <p className="text-sm text-ink-soft">{activeDomain.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <ClassBadge code={activeDomain.classCode} />
                  <Tag variant="purple">{activeDomain.termCount} terms</Tag>
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-line-soft">
                <h3 className="font-bold text-sm">
                  {activeDomain ? activeDomain.termName : "All Terms"}
                  <span className="text-muted text-xs font-normal ml-2">{terms.length} terms</span>
                </h3>
                <div className="flex items-center gap-2">
                  <button className="btn btn-sm">Filter</button>
                  <button className="btn btn-sm">Sort</button>
                </div>
              </div>

              {/* Table header */}
              <div className="grid grid-cols-[2fr_1fr_2.5fr_1fr_0.8fr_0.8fr_0.7fr] gap-3 px-5 py-3 bg-canvas-soft border-b border-line text-[11px] uppercase tracking-wider text-muted font-bold">
                <div>Term</div>
                <div>Domain</div>
                <div>Definition</div>
                <div>Classification</div>
                <div>PII</div>
                <div>Aliases</div>
                <div>Linked</div>
              </div>

              {terms.length === 0 && (
                <div className="py-16 text-center text-muted text-sm">No terms found.</div>
              )}

              {terms.map((t) => (
                <Link
                  key={t.glossaryId}
                  href={`/glossary/${t.glossaryId}`}
                  className="grid grid-cols-[2fr_1fr_2.5fr_1fr_0.8fr_0.8fr_0.7fr] gap-3 px-5 py-3.5 items-center text-sm border-b border-line-soft last:border-b-0 hover:bg-canvas-soft transition-colors"
                >
                  <div>
                    <div className="font-semibold text-brand-deep flex items-center gap-1.5">
                      <IconGlossary className="w-3.5 h-3.5 text-brand-purple shrink-0" />
                      {t.termName}
                    </div>
                    {t.aliasCount > 0 && (
                      <div className="text-[11px] text-muted mt-0.5">{t.aliasCount} alias{t.aliasCount > 1 ? "es" : ""}</div>
                    )}
                  </div>
                  <div>
                    {t.domainName
                      ? <Tag variant="blue">{t.domainName}</Tag>
                      : <span className="text-muted">—</span>}
                  </div>
                  <div className="text-ink-soft text-[13px] line-clamp-2 leading-snug">{t.definition}</div>
                  <div><ClassBadge code={t.classCode} /></div>
                  <div><PiiBadge isPii={t.isPii} /></div>
                  <div className="text-ink-soft text-xs">{t.aliasCount || "—"}</div>
                  <div>
                    {t.linkedAttrCount > 0
                      ? <Tag variant="green">{t.linkedAttrCount} col{t.linkedAttrCount > 1 ? "s" : ""}</Tag>
                      : <span className="text-muted text-xs">—</span>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

function StatCard({
  label, value, color,
}: {
  label: string;
  value: number;
  color: "purple" | "blue" | "green" | "red";
}) {
  const ring = {
    purple: "border-l-brand-purple  bg-brand-purple/5",
    blue:   "border-l-blue-400    bg-blue-50/60",
    green:  "border-l-emerald-400 bg-emerald-50/60",
    red:    "border-l-red-400     bg-red-50/60",
  }[color];
  const text = {
    purple: "text-brand-purple",
    blue:   "text-blue-600",
    green:  "text-emerald-600",
    red:    "text-red-600",
  }[color];
  return (
    <div className={`card border-l-4 ${ring} px-5 py-4`}>
      <div className={`text-2xl font-extrabold ${text}`}>{value.toLocaleString()}</div>
      <div className="text-[11px] text-muted mt-0.5 uppercase tracking-wider">{label}</div>
    </div>
  );
}
