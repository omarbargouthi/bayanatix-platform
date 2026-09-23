"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type ProviderType = "LOCAL" | "LDAP" | "OIDC";

export default function LoginForm({ redirectTo, initialError }: { redirectTo: string; initialError?: string }) {
  const router = useRouter();
  const [provider, setProvider] = useState<ProviderType | null>(null);
  const [email, setEmail] = useState("khaled@bayanatix.demo");
  const [password, setPassword] = useState("Bayanatix123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [showPasswordFallback, setShowPasswordFallback] = useState(false);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d) => {
        setProvider(d.providerType ?? "LOCAL");
        // The bundled demo credentials only make sense against LOCAL auth.
        if (d.providerType !== "LOCAL") {
          setEmail("");
          setPassword("");
        }
      })
      .catch(() => setProvider("LOCAL"));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error || "Sign-in failed");
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (provider === null) {
    return <div className="h-40" />; // avoid a form flash before we know which provider to render
  }

  if (provider === "OIDC" && !showPasswordFallback) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
          </div>
        )}
        <a
          href={`/api/auth/oidc/login?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="btn btn-primary w-full justify-center !py-2.5"
        >
          Sign in with SSO
        </a>
        <button
          type="button"
          onClick={() => setShowPasswordFallback(true)}
          className="w-full text-center text-xs text-muted hover:text-ink-soft hover:underline"
        >
          Have a local admin account? Sign in with email and password
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="field-label" htmlFor="email">{provider === "LDAP" ? "Username or email" : "Work email"}</label>
        <input
          id="email"
          type={provider === "LDAP" ? "text" : "email"}
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field-input"
          placeholder="you@organization.gov.sa"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="field-label !mb-0" htmlFor="password">Password</label>
          {provider === "LOCAL" && <a className="text-xs text-brand-purple font-medium hover:underline" href="#">Forgot?</a>}
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field-input"
          placeholder="••••••••"
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button type="submit" className="btn btn-primary w-full justify-center !py-2.5" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>

      {provider === "LOCAL" && (
        <div className="rounded-md border border-dashed border-line bg-canvas-soft px-3 py-2.5 text-[11px] text-ink-soft">
          <strong className="text-ink">Demo credentials</strong> · email
          <code className="font-mono mx-1">khaled@bayanatix.demo</code> · password
          <code className="font-mono ml-1">Bayanatix123!</code>
        </div>
      )}

      {provider === "OIDC" && showPasswordFallback && (
        <button
          type="button"
          onClick={() => setShowPasswordFallback(false)}
          className="w-full text-center text-xs text-muted hover:text-ink-soft hover:underline"
        >
          ‹ Back to SSO sign-in
        </button>
      )}
    </form>
  );
}
