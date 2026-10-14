"use client";

// One Help Center document, with its table of contents and related topics.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useLang } from "@/lib/lang-context";
import type { HelpDocView } from "@/lib/help/types";
import { HelpText } from "./HelpText";
import { UntranslatedNote, groupLabel } from "./HelpCenterClient";

export function HelpDocClient({ slug, isAdmin }: { slug: string; isAdmin: boolean }) {
  const { t, lang, isRtl } = useLang();
  const h = t.help;
  const [doc, setDoc] = useState<HelpDocView | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setDoc(null);
    fetch(`/api/help/${encodeURIComponent(slug)}?lang=${encodeURIComponent(lang)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setDoc(d.doc))
      .catch(() => setMissing(true));
  }, [slug, lang]);

  // The page loads after the browser has looked for the #section, so scroll to it here.
  useEffect(() => {
    if (!doc || !window.location.hash) return;
    const el = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
  }, [doc]);

  const back = (
    <Link href="/help" className="text-[13px] text-brand-purple font-medium hover:underline">
      {isRtl ? "→" : "←"} {h.allTopics}
    </Link>
  );

  if (missing) return <main className="px-8 py-7">{back}<p className="text-sm text-muted mt-4">{h.notFound}</p></main>;
  if (!doc) return <main className="px-8 py-7">{back}<p className="text-sm text-muted mt-4">{t.common.loading}</p></main>;

  return (
    <main className="px-8 py-7 pb-14">
      <div className="mb-4">{back}</div>
      <div className="flex gap-8 items-start">
        <article className="flex-1 min-w-0 max-w-3xl">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{groupLabel(h, doc.group)}</div>
          <h1 className="text-2xl font-extrabold text-brand-deep mt-1" dir="auto">{doc.title}</h1>
          <p className="text-[15px] text-ink-soft mt-2" dir="auto">{doc.summary}</p>
          <UntranslatedNote isAdmin={isAdmin} />
          {doc.page && (
            <Link href={doc.page} className="btn btn-sm mt-4 inline-flex">{h.openPage}</Link>
          )}

          <div className="mt-6 space-y-8">
            {doc.sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24">
                <h2 className="text-lg font-bold text-brand-deep mb-2.5" dir="auto">{s.title}</h2>
                <HelpText body={s.body} />
              </section>
            ))}
          </div>
        </article>

        <aside className="hidden lg:block w-60 shrink-0 sticky top-24 space-y-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted mb-2">{h.onThisPage}</div>
            <nav className="flex flex-col gap-1 border-s border-line ps-3">
              {doc.sections.map((s) => (
                <a key={s.id} href={`#${s.id}`} dir="auto" className="text-[13px] text-ink-soft hover:text-brand-purple">{s.title}</a>
              ))}
            </nav>
          </div>
          {doc.related.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted mb-2">{h.related}</div>
              <div className="flex flex-col gap-1">
                {doc.related.map((r) => (
                  <Link key={r.slug} href={`/help/${r.slug}`} dir="auto" className="text-[13px] text-brand-purple hover:underline">{r.title}</Link>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
