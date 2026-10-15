// HashiCorp Vault Transit as the secrets backend (SECRETS_PROVIDER=vault-transit).
// Vault holds the key and does the encryption; Bayanis stores only Vault's ciphertext
// and never sees the key. Everything is configured from the environment:
//
//   VAULT_ADDR                 https://vault.example.com:8200
//   VAULT_NAMESPACE            Vault Enterprise namespace (optional)
//   VAULT_TRANSIT_MOUNT        transit engine mount (default "transit")
//   VAULT_TRANSIT_KEY          key name (default "bayanis")
//   VAULT_AUTH_METHOD          token | approle | kubernetes (default token)
//   VAULT_AUTH_MOUNT           auth mount when not the default ("approle", "kubernetes")
//   VAULT_TOKEN / _FILE        token auth
//   VAULT_ROLE_ID, VAULT_SECRET_ID / _FILE        approle auth
//   VAULT_K8S_ROLE, VAULT_K8S_TOKEN_FILE          kubernetes auth (service account token)
//
// A private CA is trusted through Node's NODE_EXTRA_CA_CERTS. Stored values read
// "enc:vt:<mount>:<key>:vault:v<N>:<ciphertext>", so they keep working if the
// configured key changes later and say which key version sealed them.

import { readFileSync } from "fs";
import type { SecretProvider, SecretState } from "./secrets";

const PREFIX = "enc:vt:";

type Config = {
  addr: string; namespace: string | null; mount: string; key: string;
  authMethod: "token" | "approle" | "kubernetes"; authMount: string;
};

const env = (name: string): string | null => {
  const v = process.env[name]?.trim();
  if (v) return v;
  const file = process.env[`${name}_FILE`]?.trim();
  return file ? readFileSync(file, "utf8").trim() : null;
};

export function vaultConfigured(): boolean {
  return !!process.env.VAULT_ADDR?.trim();
}

function config(): Config {
  const addr = process.env.VAULT_ADDR?.trim().replace(/\/+$/, "");
  if (!addr) throw new Error("VAULT_ADDR is not set — Vault Transit is not configured");
  const authMethod = (process.env.VAULT_AUTH_METHOD?.trim().toLowerCase() || "token") as Config["authMethod"];
  if (!["token", "approle", "kubernetes"].includes(authMethod)) throw new Error(`VAULT_AUTH_METHOD "${authMethod}" is not supported — use token, approle or kubernetes`);
  return {
    addr, namespace: process.env.VAULT_NAMESPACE?.trim() || null,
    mount: (process.env.VAULT_TRANSIT_MOUNT?.trim() || "transit").replace(/^\/+|\/+$/g, ""),
    key: process.env.VAULT_TRANSIT_KEY?.trim() || "bayanis",
    authMethod, authMount: process.env.VAULT_AUTH_MOUNT?.trim() || authMethod,
  };
}

// ── HTTP + authentication ──────────────────────────────────────────────────────

// The token is reused until it nears expiry; a change of address, namespace or sign-in
// settings (the environment is reloaded) starts a new session.
let session: { token: string; expiresAt: number | null; for: string } | null = null;
const sessionKey = (cfg: Config) => [cfg.addr, cfg.namespace, cfg.authMethod, cfg.authMount,
  process.env.VAULT_TOKEN, process.env.VAULT_ROLE_ID, process.env.VAULT_K8S_ROLE].join("|");

async function request(cfg: Config, method: string, path: string, body: unknown, token: string | null): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["X-Vault-Token"] = token;
  if (cfg.namespace) headers["X-Vault-Namespace"] = cfg.namespace;
  let res: Response;
  try {
    res = await fetch(`${cfg.addr}/v1/${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    const cause = e instanceof Error ? ((e as Error & { cause?: Error }).cause?.message ?? e.message) : String(e);
    throw new Error(`Vault is unreachable at ${cfg.addr}: ${cause}`);
  }
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

// Vault's messages read "1 error occurred:\n\t* permission denied\n\n": keep the reasons.
const vaultError = (what: string, r: { status: number; json: any }) => {
  const reasons = ((r.json?.errors ?? []) as string[])
    .flatMap((e) => e.replace(/^\d+ errors? occurred:/, "").split(/\s*\*\s+/)).map((e) => e.replace(/\s+/g, " ").trim()).filter(Boolean);
  return new Error(`Vault ${what} failed (${r.status}${reasons.length ? `: ${reasons.join("; ")}` : ""})`);
};

async function login(cfg: Config): Promise<{ token: string; expiresAt: number | null; for: string }> {
  if (cfg.authMethod === "token") {
    const token = env("VAULT_TOKEN");
    if (!token) throw new Error("VAULT_TOKEN is not set (VAULT_AUTH_METHOD=token)");
    return { token, expiresAt: null, for: sessionKey(cfg) };
  }
  const body = cfg.authMethod === "approle"
    ? { role_id: env("VAULT_ROLE_ID"), secret_id: env("VAULT_SECRET_ID") }
    : { role: env("VAULT_K8S_ROLE"), jwt: readFileSync(process.env.VAULT_K8S_TOKEN_FILE?.trim() || "/var/run/secrets/kubernetes.io/serviceaccount/token", "utf8").trim() };
  if (Object.values(body).some((v) => !v)) {
    throw new Error(cfg.authMethod === "approle" ? "VAULT_ROLE_ID and VAULT_SECRET_ID must be set (VAULT_AUTH_METHOD=approle)" : "VAULT_K8S_ROLE must be set (VAULT_AUTH_METHOD=kubernetes)");
  }
  const r = await request(cfg, "POST", `auth/${cfg.authMount}/login`, body, null);
  if (r.status !== 200 || !r.json?.auth?.client_token) throw vaultError(`sign-in (${cfg.authMethod})`, r);
  const ttl = Number(r.json.auth.lease_duration) || 0;
  return { token: r.json.auth.client_token, expiresAt: ttl > 0 ? Date.now() + ttl * 1000 : null, for: sessionKey(cfg) };
}

/** Calls Vault with a valid token; signs in again (once) when the token has expired or been revoked. */
async function vault(method: string, path: string, body?: unknown): Promise<any> {
  const cfg = config();
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!session || session.for !== sessionKey(cfg) || (session.expiresAt != null && session.expiresAt - 60_000 < Date.now())) session = await login(cfg);
    const r = await request(cfg, method, path, body, session.token);
    if (r.status === 403 && attempt === 0 && cfg.authMethod !== "token") { session = null; continue; }
    if (r.status < 200 || r.status >= 300) throw vaultError(`${method} ${path}`, r);
    return r.json;
  }
}

// ── Transit operations ─────────────────────────────────────────────────────────

// Key versions are cached for 30 s; a failure for 15 s, so a status page listing many
// secrets waits for one Vault timeout, not one per secret.
type KeyMeta = { latest: number; minDecrypt: number; at: number };
const meta = new Map<string, KeyMeta | { error: Error; at: number }>();

async function keyMeta(mount: string, key: string, fresh = false): Promise<KeyMeta> {
  const id = `${mount}/${key}`;
  const cached = meta.get(id);
  if (!fresh && cached) {
    if ("error" in cached && Date.now() - cached.at < 15_000) throw cached.error;
    if (!("error" in cached) && Date.now() - cached.at < 30_000) return cached;
  }
  try {
    const j = await vault("GET", `${mount}/keys/${encodeURIComponent(key)}`);
    const m = { latest: Number(j.data.latest_version), minDecrypt: Number(j.data.min_decryption_version), at: Date.now() };
    meta.set(id, m);
    return m;
  } catch (e) {
    meta.set(id, { error: e as Error, at: Date.now() });
    throw e;
  }
}

function parse(stored: string): { mount: string; key: string; ciphertext: string; version: number } {
  const rest = stored.slice(PREFIX.length);
  const i = rest.indexOf(":"), j = rest.indexOf(":", i + 1);
  const ciphertext = rest.slice(j + 1);
  return { mount: rest.slice(0, i), key: rest.slice(i + 1, j), ciphertext, version: Number(ciphertext.split(":")[1]?.slice(1)) };
}

const label = (mount: string, key: string, version: number) => `${mount}/${key} v${version}`;

export const vaultTransitProvider: SecretProvider = {
  name: "vault-transit",
  owns: (stored) => stored.startsWith(PREFIX),

  async seal(plaintext) {
    const { mount, key } = config();
    const j = await vault("POST", `${mount}/encrypt/${encodeURIComponent(key)}`, { plaintext: Buffer.from(plaintext, "utf8").toString("base64") });
    return `${PREFIX}${mount}:${key}:${j.data.ciphertext}`;
  },

  async open(stored) {
    const { mount, key, ciphertext } = parse(stored);
    const j = await vault("POST", `${mount}/decrypt/${encodeURIComponent(key)}`, { ciphertext });
    return Buffer.from(j.data.plaintext, "base64").toString("utf8");
  },

  // Vault re-encrypts under the key's latest version itself: the plaintext never
  // reaches Bayanis.
  async rewrap(stored) {
    const { mount, key, ciphertext } = parse(stored);
    const j = await vault("POST", `${mount}/rewrap/${encodeURIComponent(key)}`, { ciphertext });
    return `${PREFIX}${mount}:${key}:${j.data.ciphertext}`;
  },

  async inspect(stored): Promise<{ state: SecretState; keyId: string | null }> {
    const { mount, key, version } = parse(stored);
    const keyId = label(mount, key, version);
    try {
      const m = await keyMeta(mount, key);
      if (!(version >= m.minDecrypt && version <= m.latest)) return { state: "unreadable", keyId };
      const cfg = config();
      return { state: mount === cfg.mount && key === cfg.key && version === m.latest ? "current" : "older-key", keyId };
    } catch {
      return { state: "unreadable", keyId };
    }
  },

  async describe() {
    const { addr, mount, key, namespace } = config();
    const m = await keyMeta(mount, key, true);
    const previous: string[] = [];
    for (let v = m.latest - 1; v >= m.minDecrypt && previous.length < 10; v--) previous.push(label(mount, key, v));
    return {
      provider: "vault-transit", currentKeyId: label(mount, key, m.latest), previousKeyIds: previous,
      location: `${addr}${namespace ? ` (namespace ${namespace})` : ""}`,
    };
  },

  async rotate() {
    const { mount, key } = config();
    await vault("POST", `${mount}/keys/${encodeURIComponent(key)}/rotate`);
    return label(mount, key, (await keyMeta(mount, key, true)).latest);
  },
};

// ── Vault KV references ────────────────────────────────────────────────────────
// Instead of a password, a field can hold a pointer to it in a Vault KV engine:
// "ref:vault:<path>#<field>", e.g. ref:vault:secret/bayanis/finance-db#password. The
// customer's team keeps and rotates the password in Vault; Bayanis reads it each time
// it connects and never stores it. Works with either SECRETS_PROVIDER, as long as
// Vault is configured (VAULT_ADDR and sign-in). KV v1 and v2 are both supported; the
// version is read from Vault. VAULT_KV_ALLOWED_PATHS (comma-separated path prefixes,
// e.g. "secret/bayanis/") limits which paths a reference may point to.

const REF = "ref:vault:";

export function isVaultRef(value: string | null | undefined): boolean {
  return !!value && value.startsWith(REF);
}

/** "secret/bayanis/db#password" → "ref:vault:secret/bayanis/db#password", after checking it. */
export function toVaultRef(pathAndField: string): string {
  parseRef(REF + pathAndField.trim());
  return REF + pathAndField.trim();
}

/** The "<path>#<field>" part shown in forms (it is not secret). */
export function vaultRefPath(value: string | null | undefined): string | null {
  return isVaultRef(value) ? value!.slice(REF.length) : null;
}

export function vaultAllowedPaths(): string[] {
  return (process.env.VAULT_KV_ALLOWED_PATHS ?? "").split(",").map((p) => p.trim().replace(/^\/+/, "")).filter(Boolean);
}

function parseRef(stored: string): { path: string; field: string } {
  const body = stored.slice(REF.length);
  const hash = body.lastIndexOf("#");
  const path = (hash > 0 ? body.slice(0, hash) : "").replace(/^\/+|\/+$/g, "");
  const field = hash > 0 ? body.slice(hash + 1).trim() : "";
  if (!path || !field || !path.includes("/") || /\s|\.\./.test(path)) {
    throw new Error(`"${body}" is not a Vault reference — write it as <mount>/<path>#<field>, e.g. secret/bayanis/finance-db#password`);
  }
  if (!vaultConfigured()) throw new Error("Vault is not configured on this server (VAULT_ADDR), so a Vault reference cannot be used");
  const allowed = vaultAllowedPaths();
  if (allowed.length && !allowed.some((p) => path.startsWith(p))) {
    throw new Error(`Vault references must be under ${allowed.join(" or ")} (VAULT_KV_ALLOWED_PATHS)`);
  }
  return { path, field };
}

const kvMounts = new Map<string, { mount: string; version: number; at: number }>();

async function kvMount(path: string): Promise<{ mount: string; version: number }> {
  const hit = [...kvMounts.values()].find((m) => path.startsWith(m.mount) && Date.now() - m.at < 300_000);
  if (hit) return hit;
  const j = await vault("GET", `sys/internal/ui/mounts/${path.split("/").map(encodeURIComponent).join("/")}`);
  const mount = String(j.data.path);
  if (j.data.type && j.data.type !== "kv") throw new Error(`${mount} is not a KV secrets engine`);
  const m = { mount, version: Number(j.data.options?.version ?? 1) === 2 ? 2 : 1, at: Date.now() };
  kvMounts.set(mount, m);
  return m;
}

async function readRef(stored: string): Promise<string> {
  const { path, field } = parseRef(stored);
  const { mount, version } = await kvMount(path);
  const rest = path.slice(mount.length).split("/").map(encodeURIComponent).join("/");
  let j: any;
  try {
    j = await vault("GET", version === 2 ? `${mount}data/${rest}` : `${mount}${rest}`);
  } catch (e) {
    if (e instanceof Error && /\(404/.test(e.message)) throw new Error(`Nothing is stored in Vault at ${path}`);
    throw e;
  }
  const data = version === 2 ? j?.data?.data : j?.data;
  const value = data?.[field];
  if (value == null) throw new Error(`Vault has no field "${field}" at ${path}`);
  return String(value);
}

export const vaultKvReferences: SecretProvider = {
  name: "vault-kv",
  reference: true,
  owns: (stored) => stored.startsWith(REF),
  async seal() { throw new Error("A Vault reference is entered, not created by encryption"); },
  open: readRef,
  async inspect(stored) {
    try { await readRef(stored); return { state: "reference", keyId: null }; }
    catch { return { state: "unreadable", keyId: null }; }
  },
  async describe() { throw new Error("Vault references are not a provider for new values"); },
};

/** Checks that a reference resolves, without returning the value. */
export async function checkVaultRef(pathAndField: string): Promise<{ ok: boolean; message: string }> {
  try {
    await readRef(toVaultRef(pathAndField));
    return { ok: true, message: "Found in Vault" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** For save routes: the reason a submitted Vault reference cannot be used, or null
 *  (also null for an ordinary password). Lets them answer 400 instead of failing. */
export function invalidVaultRef(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v !== "string" || !isVaultRef(v.trim())) continue;
    try { toVaultRef(vaultRefPath(v.trim())!); } catch (e) { return e instanceof Error ? e.message : String(e); }
  }
  return null;
}
