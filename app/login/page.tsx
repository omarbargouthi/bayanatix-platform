import LoginForm from "./LoginForm";
import { LoginLangBar } from "./LoginLangBar";
import { LoginGraphic } from "./LoginGraphic";
import { IconDB, IconGlossary, IconLineage, IconShield } from "@/components/layout/icons";

export const metadata = { title: "Sign in · Bayanatix" };

const FEATURES = [
  { Icon: IconDB, title: "Unified Data Catalog", desc: "Every source, schema, table and column — searchable in one inventory." },
  { Icon: IconGlossary, title: "Glossary & Classification", desc: "Govern business terms, sensitive data types, and PII across every asset." },
  { Icon: IconLineage, title: "End-to-End Lineage", desc: "Trace data from source system to report, automatically." },
  { Icon: IconShield, title: "Compliance & Quality", desc: "NDMO and PDPL alignment with live data quality scoring, built in." },
];

export default function LoginPage({ searchParams }: { searchParams: { from?: string; error?: string } }) {
  const from = searchParams.from || "/dashboard";
  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-canvas">
      {/* Left: brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-brand-deep via-brand-navy to-brand-violet text-white">
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-brand-light/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-purple/40 blur-3xl" />
        <LoginGraphic className="absolute top-1/2 -translate-y-1/2 -right-10 w-[30rem] h-[30rem] opacity-80" />

        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" alt="" className="w-10 h-12" />
          <span className="text-lg font-bold tracking-[0.18em]">BAYANATIX</span>
        </div>

        <div className="relative max-w-md">
          <p className="uppercase tracking-[0.2em] text-xs text-brand-light font-semibold mb-4">
            Data Governance · NDMO · PDPL
          </p>
          <h1 className="text-3xl font-bold leading-tight mb-3">
            One platform to know, trust, and govern your data.
          </h1>
          <p className="text-white/75 text-sm leading-relaxed">
            Bayanatix connects your catalog, glossary, lineage, and compliance into a single
            source of truth — so every team works from the same trusted view of the data.
          </p>

          <div className="mt-9 space-y-4">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-3">
                <span className="shrink-0 w-9 h-9 rounded-lg bg-white/10 grid place-items-center">
                  <Icon className="w-4.5 h-4.5 text-brand-light" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <div className="text-xs text-white/65 leading-snug mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Bayanatix · Riyadh, Kingdom of Saudi Arabia
        </p>
      </section>

      {/* Right: form */}
      <section className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <LoginLangBar>
            <div className="lg:hidden flex items-center gap-2 mb-8">
              <img src="/logo.svg" alt="" className="w-8 h-10" />
              <span className="font-bold tracking-[0.18em] text-brand-deep">BAYANATIX</span>
            </div>

            <h2 className="text-2xl font-bold text-ink mb-2">Sign in</h2>
            <p className="text-sm text-ink-soft mb-8">
              Welcome back. Enter your credentials to continue.
            </p>

            <LoginForm redirectTo={from} initialError={searchParams.error} />

            <p className="mt-8 text-xs text-muted text-center">
              By signing in you agree to the Bayanatix acceptable use policy.
            </p>
          </LoginLangBar>
        </div>
      </section>
    </main>
  );
}
