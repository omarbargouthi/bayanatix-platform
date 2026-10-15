// Key rotation for stored secrets. The key itself lives in the environment, so a
// rotation is: set the new key as LLM_SECRETS_MASTER_KEY, move the old one to
// LLM_SECRETS_PREVIOUS_KEYS, restart, then re-encrypt here (Configuration ›
// Encryption Keys, or scripts/reseal-secrets.mjs). Once nothing uses the old key it
// can be removed. Re-encryption also seals any plain-text data source password.

import { sql } from "./db";
import { logUpdate } from "./audit";
import { activeSecretProvider, inspectSecret, openSecret, sealSecret, type SecretState } from "./secrets";

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
  currentKeyId: string;
  previousKeyIds: string[];
  /** Previous keys no stored value uses any more: safe to remove from the environment. */
  unusedPreviousKeyIds: string[];
  stores: SecretStoreStatus[];
  lastReseal: { at: string; keyId: string; byUserId: string } | null;
};

export async function getSecretsStatus(db: Db = sql): Promise<SecretsStatus> {
  const provider = activeSecretProvider().describe();
  const stores: SecretStoreStatus[] = [];
  const used = new Set<string>();
  for (const s of STORES) {
    const rows = await s.list(db);
    const st: SecretStoreStatus = {
      code: s.code, name: s.name, total: rows.length,
      counts: { current: 0, "older-key": 0, plain: 0, unreadable: 0 }, byKey: {}, unreadable: [],
    };
    for (const r of rows) {
      const { state, keyId } = await inspectSecret(r.value);
      st.counts[state]++;
      if (keyId) { st.byKey[keyId] = (st.byKey[keyId] ?? 0) + 1; used.add(keyId); }
      if (state === "unreadable") st.unreadable.push(r.label);
    }
    stores.push(st);
  }
  const [cfg] = await db<{ value: string }[]>`SELECT value FROM bayanat.system_config WHERE key = 'secrets_last_reseal'`;
  return {
    ...provider,
    unusedPreviousKeyIds: provider.previousKeyIds.filter((k) => !used.has(k)),
    stores,
    lastReseal: cfg ? JSON.parse(cfg.value) : null,
  };
}

export type ResealResult = {
  keyId: string;
  resealed: number;
  alreadyCurrent: number;
  failed: { store: string; label: string; reason: string }[];
};

/** Re-encrypts every stored secret not yet under the current key. Each value is checked
 *  by opening it again before it is written, and only replaces the exact value read. */
export async function resealAll(userId: string, db: Db = sql): Promise<ResealResult> {
  const keyId = activeSecretProvider().describe().currentKeyId;
  const result: ResealResult = { keyId, resealed: 0, alreadyCurrent: 0, failed: [] };
  for (const s of STORES) {
    for (const r of await s.list(db)) {
      const { state } = await inspectSecret(r.value);
      if (state === "current") { result.alreadyCurrent++; continue; }
      try {
        if (state === "unreadable") throw new Error("not readable with any configured key");
        const plaintext = (await openSecret(r.value))!;
        const sealed = (await sealSecret(plaintext))!;
        if ((await openSecret(sealed)) !== plaintext) throw new Error("check after re-encryption failed");
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
