import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in · Bayanatix" };

export default function LoginPage({ searchParams }: { searchParams: { from?: string } }) {
  const from = searchParams.from || "/dashboard";
  return (
    <main className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-canvas">
      {/* Left: brand panel */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-gradient-to-br from-brand-deep via-brand-navy to-brand-violet text-white">
        <div className="absolute -top-32 -right-24 w-96 h-96 rounded-full bg-brand-light/30 blur-3xl" />
        <div className="absolute -bottom-32 -left-24 w-[28rem] h-[28rem] rounded-full bg-brand-purple/40 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <img src="/logo.svg" alt="" className="w-10 h-12" />
          <span className="text-lg font-bold tracking-[0.18em]">BAYANATIX</span>
        </div>

        <div className="relative max-w-md">
          <p className="uppercase tracking-[0.2em] text-xs text-brand-light font-semibold mb-4">
            Data Governance · NDMO · PDPL
          </p>
          <h1 className="text-3xl font-bold leading-tight mb-3">
            Treat your data as a national treasure.
          </h1>
          <p className="text-white/75 text-sm leading-relaxed">
            Bayanatix unifies your catalog, quality, classification, and compliance — backed
            by deep integrations with Informatica, Collibra, erwin, OvalEdge, and Microsoft
            Purview.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-4 text-center">
            <Stat label="Specs tracked" value="191" />
            <Stat label="NDMO domains" value="14" />
            <Stat label="Faster adoption" value="50%" />
          </div>
        </div>

        <p className="relative text-xs text-white/50">
          © {new Date().getFullYear()} Bayanatix · Riyadh, Kingdom of Saudi Arabia
        </p>
      </section>

      {/* Right: form */}
      <section className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <img src="/logo.svg" alt="" className="w-8 h-10" />
            <span className="font-bold tracking-[0.18em] text-brand-deep">BAYANATIX</span>
          </div>

          <h2 className="text-2xl font-bold text-ink mb-2">Sign in</h2>
          <p className="text-sm text-ink-soft mb-8">
            Welcome back. Enter your credentials to continue.
          </p>

          <LoginForm redirectTo={from} />

          <p className="mt-8 text-xs text-muted text-center">
            By signing in you agree to the Bayanatix acceptable use policy.
          </p>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 backdrop-blur rounded-lg py-3">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/60">{label}</div>
    </div>
  );
}
