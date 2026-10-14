"use client";

// The Help Center's front page: search, then every topic grouped by area of the product.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import { HELP_GROUPS, type HelpGroup, type HelpIndexEntry } from "@/lib/help/types";
import type { I18nStrings } from "@/lib/i18n/strings";

type Result = { slug: string; title: string; sectionId: string | null; sectionTitle: string | null; snippet: string };

export function groupLabel(h: I18nStrings["help"], g: HelpGroup): string {
  const map: Record<HelpGroup, string> = {
    start: h.groupStart, workspace: h.groupWorkspace, catalog: h.groupCatalog, domains: h.groupDomains,
    privacy: h.groupPrivacy, reports: h.groupReports, admin: h.groupAdmin,
  };
  return map[g];
}

export function UntranslatedNote({ isAdmin }: { isAdmin: boolean }) {
  const { t, lang } = useLang();
  if (lang === "en") return null;
  return (
    <p className="text-[12px] text-muted mt-2">
      {t.help.untranslatedNote}
      {isAdmin && <> <Link href="/admin/languages?tab=Workbench&category=HELP_DOCS" className="text-brand-purple hover:underline">{t.help.translateLink}</Link></>}
    </p>
  );
}

export function HelpCenterClient({ isAdmin }: { isAdmin: boolean }) {
  const { t, lang } = useLang();
  const h = t.help;
  const [topics, setTopics] = useState<HelpIndexEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    fetch(`/api/help?lang=${encodeURIComponent(lang)}`).then((r) => r.json()).then((d) => setTopics(d.topics ?? [])).catch(() => setTopics([]));
  }, [lang]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) { setResults(null); return; }
    const id = setTimeout(() => {
      fetch(`/api/help?lang=${encodeURIComponent(lang)}&q=${encodeURIComponent(needle)}`)
        .then((r) => r.json()).then((d) => setResults(d.results ?? [])).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, lang]);

  return (
    <main className="px-8 py-7 pb-14 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-deep">{h.title}</h1>
        <p className="text-sm text-muted mt-1 max-w-3xl">{h.subtitle}</p>
        <UntranslatedNote isAdmin={isAdmin} />
      </div>

      <input
        className="input-field w-full max-w-2xl mb-7"
        placeholder={h.searchPh}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label={h.searchPh}
      />

      {results ? (
        results.length === 0 ? (
          <p className="text-sm text-muted">{h.noResults}</p>
        ) : (
          <div className="space-y-2 max-w-3xl">
            {results.map((r, i) => (
              <Link key={i} href={`/help/${r.slug}${r.sectionId ? `#${r.sectionId}` : ""}`} className="block card px-4 py-3 hover:border-brand-purple/40 transition-colors">
                <div className="text-[14px] font-semibold text-brand-deep" dir="auto">
                  {r.title}{r.sectionTitle && <span className="text-muted font-normal"> › {r.sectionTitle}</span>}
                </div>
                <div className="text-[12.5px] text-ink-soft mt-0.5 line-clamp-2" dir="auto">{r.snippet}</div>
              </Link>
            ))}
          </div>
        )
      ) : topics == null ? (
        <p className="text-sm text-muted">{t.common.loading}</p>
      ) : (
        <div className="space-y-8">
          {HELP_GROUPS.map((g) => {
            const list = topics.filter((x) => x.group === g);
            if (list.length === 0) return null;
            return (
              <section key={g}>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted mb-3">{groupLabel(h, g)}</h2>
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {list.map((d) => (
                    <Link key={d.slug} href={`/help/${d.slug}`} className="card p-4 hover:border-brand-purple/40 hover:shadow-sm transition-all">
                      <div className="text-[14px] font-bold text-brand-deep" dir="auto">{d.title}</div>
                      <div className="text-[12.5px] text-ink-soft mt-1 leading-relaxed" dir="auto">{d.summary}</div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
          <Link href="/about" className="inline-block text-[13px] text-brand-purple font-medium hover:underline">{h.about}</Link>
        </div>
      )}
    </main>
  );
}
