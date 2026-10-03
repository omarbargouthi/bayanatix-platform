// Encrypted secrets store (LLM Provider Config spec §3): AES-256-GCM with a master
// key from the environment (v1 — pluggable backend for Vault/cloud KMS later). Keys
// are write-only: nothing that reads a llm_credentials row ever returns the
// plaintext, only encrypt() (called once, at entry/rotation time) touches it.

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getMasterKey(): Buffer {
  const raw = process.env.LLM_SECRETS_MASTER_KEY;
  if (!raw) throw new Error("LLM_SECRETS_MASTER_KEY is not set — add a 32-byte (64 hex char) key to .env.local");
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("LLM_SECRETS_MASTER_KEY must decode to exactly 32 bytes (64 hex characters)");
  return key;
}

export type EncryptedSecret = { ciphertextB64: string; ivB64: string; authTagB64: string; last4: string };

export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString("base64"),
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
    last4: plaintext.slice(-4),
  };
}

export function decryptSecret(enc: { ciphertextB64: string; ivB64: string; authTagB64: string }): string {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(enc.ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(enc.authTagB64, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(enc.ciphertextB64, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}

// ── Sealed strings: a secret stored in an ordinary text column ─────────────────
// Format "enc:v1:<iv>:<authTag>:<ciphertext>" (base64 parts), so a column can hold
// either a sealed value or — for rows written before encryption was introduced —
// legacy plain text, which openSecret() passes through unchanged until
// scripts/encrypt-connection-passwords.mjs seals it. Used for data source
// connection passwords (bayanat.connection_registry.password_text).
const SEALED_PREFIX = "enc:v1:";

export function isSealed(value: string | null | undefined): boolean {
  return !!value && value.startsWith(SEALED_PREFIX);
}

export function sealSecret(plaintext: string | null | undefined): string | null {
  if (plaintext == null || plaintext === "") return plaintext ?? null;
  if (isSealed(plaintext)) return plaintext;
  const e = encryptSecret(plaintext);
  return `${SEALED_PREFIX}${e.ivB64}:${e.authTagB64}:${e.ciphertextB64}`;
}

export function openSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!isSealed(stored)) return stored;
  const [ivB64, authTagB64, ciphertextB64] = stored.slice(SEALED_PREFIX.length).split(":");
  return decryptSecret({ ivB64, authTagB64, ciphertextB64 });
}
