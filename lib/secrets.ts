// Encrypted secrets (LLM Provider Config spec §3, extended for key rotation and
// pluggable backends). Every stored secret is one self-describing string, so values
// written by different keys or backends can live side by side while they are moved:
//
//   enc:v2:<keyId>:<iv>:<authTag>:<ciphertext>   local AES-256-GCM, names its key
//   enc:v1:<iv>:<authTag>:<ciphertext>           older local format, key not named
//   enc:vt:<mount>:<key>:vault:v<N>:<ciphertext>  HashiCorp Vault Transit (lib/secrets-vault.ts)
//   ref:vault:<path>#<field>                      not a secret but where it is: read from
//                                                 Vault KV on each use, never stored here
//   anything else                                legacy plain text (connection
//                                                passwords from before encryption)
//
// Secrets are write-only: nothing that returns data to a browser ever opens one.
// All calls are async so a network backend can sit behind the same functions;
// SECRETS_PROVIDER picks the backend new values use: "local" (default) or
// "vault-transit". Values sealed by the other backend keep opening, which is how
// secrets move between them (lib/secrets-rotation.ts re-encrypts them).

import crypto from "crypto";
import { vaultTransitProvider, vaultKvReferences, toVaultRef, vaultRefPath } from "./secrets-vault";

const ALGORITHM = "aes-256-gcm";
const V1 = "enc:v1:";
const V2 = "enc:v2:";

/** Where a stored value stands against the active provider's current key. */
/** "reference": a pointer to a password kept in Vault KV, which re-encryption leaves alone. */
export type SecretState = "current" | "older-key" | "plain" | "unreadable" | "reference";

export interface SecretProvider {
  readonly name: string;
  /** Holds pointers to secrets kept elsewhere, not encrypted values: never the active provider. */
  readonly reference?: boolean;
  /** True when this provider wrote the stored value (and so can open it). */
  owns(stored: string): boolean;
  seal(plaintext: string): Promise<string>;
  open(stored: string): Promise<string>;
  inspect(stored: string): Promise<{ state: SecretState; keyId: string | null }>;
  describe(): Promise<{ provider: string; currentKeyId: string; previousKeyIds: string[]; location?: string }>;
  /** Re-encrypts under the current key version without the plaintext leaving the backend. */
  rewrap?(stored: string): Promise<string>;
  /** Creates a new key version in the backend; returns its id. */
  rotate?(): Promise<string>;
}

// ── Local provider: keys from the environment ──────────────────────────────────
// LLM_SECRETS_MASTER_KEY is the current key (64 hex characters). During a rotation
// the old key moves to LLM_SECRETS_PREVIOUS_KEYS (comma-separated) so values it
// sealed can still be opened until they are re-encrypted. A key is named by the
// first 8 hex characters of its SHA-256, which says nothing about the key itself.

type Key = { id: string; key: Buffer };

function parseKey(raw: string, envName: string): Key {
  const key = Buffer.from(raw.trim(), "hex");
  if (key.length !== 32) throw new Error(`${envName} must hold 32-byte keys (64 hex characters)`);
  return { id: crypto.createHash("sha256").update(key).digest("hex").slice(0, 8), key };
}

function keyring(): { current: Key; previous: Key[] } {
  const raw = process.env.LLM_SECRETS_MASTER_KEY;
  if (!raw) throw new Error("LLM_SECRETS_MASTER_KEY is not set — add a 32-byte (64 hex char) key to .env.local");
  const current = parseKey(raw, "LLM_SECRETS_MASTER_KEY");
  const previous = (process.env.LLM_SECRETS_PREVIOUS_KEYS ?? "")
    .split(/[\s,]+/).filter(Boolean)
    .map((k) => parseKey(k, "LLM_SECRETS_PREVIOUS_KEYS"))
    .filter((k) => k.id !== current.id);
  return { current, previous };
}

function decrypt(key: Buffer, ivB64: string, authTagB64: string, ciphertextB64: string): string {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextB64, "base64")), decipher.final()]).toString("utf8");
}

/** Opens a value and says which key opened it; v1 values are tried against every key. */
function openLocal(stored: string): { plaintext: string; keyId: string } {
  const { current, previous } = keyring();
  const all = [current, ...previous];
  if (stored.startsWith(V2)) {
    const [keyId, iv, tag, ct] = stored.slice(V2.length).split(":");
    const k = all.find((x) => x.id === keyId);
    if (!k) throw new Error(`Secret was encrypted with key ${keyId}, which is not configured — add it to LLM_SECRETS_PREVIOUS_KEYS`);
    return { plaintext: decrypt(k.key, iv, tag, ct), keyId };
  }
  const [iv, tag, ct] = stored.slice(V1.length).split(":");
  for (const k of all) {
    try { return { plaintext: decrypt(k.key, iv, tag, ct), keyId: k.id }; } catch { /* next key */ }
  }
  throw new Error("Secret could not be decrypted with any configured key — add the key it was encrypted with to LLM_SECRETS_PREVIOUS_KEYS");
}

const localProvider: SecretProvider = {
  name: "local",
  owns: (stored) => stored.startsWith(V1) || stored.startsWith(V2),
  async seal(plaintext) {
    const { current } = keyring();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, current.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return `${V2}${current.id}:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
  },
  async open(stored) {
    return openLocal(stored).plaintext;
  },
  async inspect(stored) {
    try {
      const { keyId } = openLocal(stored);
      // A v1 value is rewritten even under the current key, so that it names its key.
      return { state: keyId === keyring().current.id && stored.startsWith(V2) ? "current" : "older-key", keyId };
    } catch {
      return { state: "unreadable", keyId: stored.startsWith(V2) ? stored.slice(V2.length).split(":")[0] : null };
    }
  },
  async describe() {
    const { current, previous } = keyring();
    return { provider: "local", currentKeyId: current.id, previousKeyIds: previous.map((k) => k.id) };
  },
};

// ── Provider selection ─────────────────────────────────────────────────────────
// New backends register here; opening dispatches on the value's own prefix, so a
// database part-way through a move between backends keeps working.
const PROVIDERS: SecretProvider[] = [localProvider, vaultTransitProvider, vaultKvReferences];

export function activeSecretProvider(): SecretProvider {
  const name = (process.env.SECRETS_PROVIDER ?? "local").trim().toLowerCase();
  const choices = PROVIDERS.filter((x) => !x.reference);
  const p = choices.find((x) => x.name === name);
  if (!p) throw new Error(`SECRETS_PROVIDER "${name}" is not supported — available: ${choices.map((x) => x.name).join(", ")}`);
  return p;
}

export function isSealed(value: string | null | undefined): boolean {
  return !!value && PROVIDERS.some((p) => p.owns(value));
}

/** Encrypts with the active provider's current key. Null and "" pass through, and so
 *  does a Vault reference ("ref:vault:<path>#<field>"), once checked. */
export async function sealSecret(plaintext: string | null | undefined): Promise<string | null> {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  const ref = vaultRefPath(plaintext);
  if (ref != null) return toVaultRef(ref);
  if (isSealed(plaintext)) return plaintext;
  return activeSecretProvider().seal(plaintext);
}

/** Opens a stored value with whichever provider wrote it; legacy plain text passes through. */
export async function openSecret(stored: string | null | undefined): Promise<string | null> {
  if (stored == null) return null;
  const p = PROVIDERS.find((x) => x.owns(stored));
  return p ? p.open(stored) : stored;
}

/** The provider that sealed a stored value (null for plain text). */
export function ownerOf(stored: string): SecretProvider | null {
  return PROVIDERS.find((x) => x.owns(stored)) ?? null;
}

/** Where a stored value stands; used by the key-rotation status and re-encryption.
 *  A value sealed by another provider than the active one is "older-key" when still
 *  readable: re-encryption moves it. */
export async function inspectSecret(stored: string): Promise<{ state: SecretState; keyId: string | null }> {
  const p = ownerOf(stored);
  if (!p) return { state: "plain", keyId: null };
  const r = await p.inspect(stored).catch(() => ({ state: "unreadable" as SecretState, keyId: null }));
  if (!p.reference && p !== activeSecretProvider() && r.state === "current") return { ...r, state: "older-key" };
  return r;
}
