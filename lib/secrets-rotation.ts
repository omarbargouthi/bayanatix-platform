// Key rotation and moving secrets between backends. Re-encryption brings every stored
// secret under the active provider's current key:
//  * local key rotated: set the new key as LLM_SECRETS_MASTER_KEY, move the old one to
//    LLM_SECRETS_PREVIOUS_KEYS, restart, re-encrypt; then remove the old key.
//  * Vault Transit key rotated (in Vault, or Rotate on the page): Vault rewraps each
//    value itself, so the plaintext never reaches Bayanis.
//  * moving to Vault (or back): set SECRETS_PROVIDER, keep the old backend configured,
//    restart, re-encrypt — each value is opened by the backend that sealed it.
// Runs from Configuration › Encryption Keys or scripts/reseal-secrets.mjs. Also seals
// any plain-text data source password.

import { sql } from "./db";
import { logUpdate } from "./audit";
import { activeSecretProvider, inspectSecret, openSecret, ownerOf, sealSecret, type SecretState } from "./secrets";

type Db = typeof sql;

type StoredSecret = { id: number; label: string; value: string };

// Every place a secret is stored. A new one is added here and is then covered by
// the status, the re-encryption and (later) the move to another backend.
const STORES: {
  code: string; name: string;
  list: (db: Db) => Promise<StoredSecret[]>;
  write: (db: Db, id: number, oldValue: string, newValue: string) => Promise<boolean>;
}[] = [
  {
    code: "CREDENTIALS",
    name: "AI provider keys, LDAP bind passwords and the SSO client secret",
    list: (db) => db<StoredSecret[]>`
      SELECT credential_id AS id, coalesce(label_text, 'credential ' || credential_id) AS label, sealed_text AS value
      FROM bayanat.llm_credentials ORDER BY credential_id`,
    write: async (db, id, oldValue, newValue) => (await db`
      UPDATE bayanat.llm_credentials SET sealed_text = ${newValue}
      WHERE credential_id = ${id} AND sealed_text = ${oldValue}`).count === 1,
  },
  {
    code: "CONNECTIONS",
    name: "Data source passwords",
    list: (db) => db<StoredSecret[]>`
      SELECT connection_id AS id, connection_name AS label, password_text AS value
      FROM bayanat.connection_registry
      WHERE password_text IS NOT NULL AND password_text <> '' ORDER BY connection_id`,
    write: async (db, id, oldValue, newValue) => (await db`
      UPDATE bayanat.connection_registry SET password_text = ${newValue}
      WHERE connection_id = ${id} AND password_text = ${oldValue}`).count === 1,
  },
];

export type SecretStoreStatus = {
  code: string; name: string; total: number;
  counts: Record<SecretState, number>;
  byKey: Record<string, number>;
  unreadable: string[];
};

export type SecretsStatus = {
  provider: string;
  /** Where the key lives, for a network backend (Vault address and namespace). */
  location: string | null;
  /** Set when the active provider cannot be reached or is misconfigured. */
  providerError: string | null;
  canRotate: boolean;
  currentKeyId: string;
  previousKeyIds: string[];
  /** Stored values sealed by another backend than the active one, still to be moved. */
  otherProvider: number;
  /** Previous keys no stored value uses any more: safe to remove from the environment. */
  unusedPreviousKeyIds: string[];
  stores: SecretStoreStatus[];
  lastReseal: { at: string; keyId: string; byUserId: string } | null;
};

export async function getSecretsStatus(db: Db = sql): Promise<SecretsStatus> {
  const active = activeSecretProvider();
  let provider: { provider: string; currentKeyId: string; previousKeyIds: string[]; location?: string };
  let providerError: string | null = null;
  try { provider = await active.describe(); } catch (e) {
    providerError = e instanceof Error ? e.message : String(e);
    provider = { provider: active.name, currentKeyId: "", previousKeyIds: [] };
  }
  const stores: SecretStoreStatus[] = [];
  const used = new Set<string>();
  let otherProvider = 0;
  for (const s of STORES) {
    const rows = await s.list(db);
    const st: SecretStoreStatus = {
      code: s.code, name: s.name, total: rows.length,
      counts: { current: 0, "older-key": 0, plain: 0, unreadable: 0, reference: 0 }, byKey: {}, unreadable: [],
    };
    for (const r of rows) {
      const { state, keyId } = await inspectSecret(r.value);
      const owner = ownerOf(r.value);
      if (owner && !owner.reference && owner !== active) otherProvider++;
      st.counts[state]++;
      if (keyId) { st.byKey[keyId] = (st.byKey[keyId] ?? 0) + 1; used.add(keyId); }
      if (state === "unreadable") st.unreadable.push(r.label);
    }
    stores.push(st);
  }
  const [cfg] = await db<{ value: string }[]>`SELECT value FROM bayanat.system_config WHERE key = 'secrets_last_reseal'`;
  return {
    ...provider,
    location: provider.location ?? null, providerError, canRotate: !!active.rotate, otherProvider,
    unusedPreviousKeyIds: provider.previousKeyIds.filter((k) => !used.has(k)),
    stores,
    lastReseal: cfg ? JSON.parse(cfg.value) : null,
  };
}

export type ResealResult = {
  keyId: string;
  resealed: number;
  alreadyCurrent: number;
  /** Vault references: nothing to re-encrypt, the password lives in Vault. */
  references: number;
  failed: { store: string; label: string; reason: string }[];
};

/** Re-encrypts every stored secret not yet under the current key. Each value is checked
 *  by opening it again before it is written, and only replaces the exact value read. */
export async function resealAll(userId: string, db: Db = sql): Promise<ResealResult> {
  const active = activeSecretProvider();
  const keyId = (await active.describe()).currentKeyId;
  const result: ResealResult = { keyId, resealed: 0, alreadyCurrent: 0, references: 0, failed: [] };
  for (const s of STORES) {
    for (const r of await s.list(db)) {
      if (ownerOf(r.value)?.reference) { result.references++; continue; }
      const { state } = await inspectSecret(r.value);
      if (state === "current") { result.alreadyCurrent++; continue; }
      try {
        if (state === "unreadable") throw new Error("not readable with any configured key");
        let sealed: string;
        if (ownerOf(r.value) === active && active.rewrap) {
          sealed = await active.rewrap(r.value);
          if ((await inspectSecret(sealed)).state !== "current") throw new Error("check after re-encryption failed");
        } else {
          const plaintext = (await openSecret(r.value))!;
          sealed = (await sealSecret(plaintext))!;
          if ((await openSecret(sealed)) !== plaintext) throw new Error("check after re-encryption failed");
        }
        if (!(await s.write(db, r.id, r.value, sealed))) throw new Error("changed while re-encrypting — run again");
        result.resealed++;
      } catch (e) {
        result.failed.push({ store: s.name, label: r.label, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const value = JSON.stringify({ at: new Date().toISOString(), keyId, byUserId: userId });
  await db`
    INSERT INTO bayanat.system_config (key, value) VALUES ('secrets_last_reseal', ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return result;
}

export async function logReseal(userId: string, r: ResealResult): Promise<void> {
  await logUpdate("PLATFORM_SETTINGS", 1, userId, [{
    field: "secrets_reencrypted", oldVal: null, force: true,
    newVal: `key ${r.keyId}: ${r.resealed} re-encrypted, ${r.alreadyCurrent} already current, ${r.failed.length} failed`,
  }]);
}

/** Creates a new key version in the active backend (Vault Transit), when it allows it. */
export async function rotateKey(userId: string): Promise<string> {
  const active = activeSecretProvider();
  if (!active.rotate) throw new Error("This key lives in the server environment: rotate it there (see How to rotate the key)");
  const before = (await active.describe()).currentKeyId;
  const after = await active.rotate();
  await logUpdate("PLATFORM_SETTINGS", 1, userId, [{ field: "secrets_key_rotated", oldVal: before, newVal: after, force: true }]);
  return after;
}

/** Seals and opens a test value with the active backend, without storing anything. */
export async function testProvider(): Promise<{ ok: boolean; message: string; ms: number }> {
  const started = Date.now();
  try {
    const canary = `bayanis-check-${started}`;
    const sealed = (await sealSecret(canary))!;
    const ok = (await openSecret(sealed)) === canary;
    return { ok, message: ok ? "Encrypted and decrypted a test value" : "The test value did not decrypt to the same text", ms: Date.now() - started };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}
