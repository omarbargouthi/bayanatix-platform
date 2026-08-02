// One-time seed: wraps the existing ANTHROPIC_API_KEY (already used directly by the
// AI Enrichment feature) as a proper llm_provider_profiles row, encrypted via
// lib/secrets.ts, and makes it the active default so enrichment keeps working while
// the bundled self-hosted profile sits disabled until a real vLLM endpoint exists.
// Run once: DATABASE_URL=... LLM_SECRETS_MASTER_KEY=... npx tsx scripts/seed-llm-anthropic-profile.mjs

import postgres from "postgres";
import crypto from "crypto";

const DATABASE_URL = process.env.DATABASE_URL;
const MASTER_KEY = process.env.LLM_SECRETS_MASTER_KEY;
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
if (!MASTER_KEY) throw new Error("LLM_SECRETS_MASTER_KEY not set");
if (!API_KEY) throw new Error("ANTHROPIC_API_KEY not set — nothing to seed");

function encrypt(plaintext, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertextB64: ciphertext.toString("base64"),
    ivB64: iv.toString("base64"),
    authTagB64: authTag.toString("base64"),
    last4: plaintext.slice(-4),
  };
}

const sql = postgres(DATABASE_URL, { types: { bigint: postgres.BigInt } });

const existing = await sql`SELECT profile_id FROM bayanat.llm_provider_profiles WHERE profile_name_text = 'Anthropic Claude'`;
if (existing.length > 0) {
  console.log(`Already seeded (profile_id=${existing[0].profile_id}) — nothing to do.`);
  await sql.end();
  process.exit(0);
}

const enc = encrypt(API_KEY, MASTER_KEY);
const [cred] = await sql`
  INSERT INTO bayanat.llm_credentials (label_text, ciphertext_b64, iv_b64, auth_tag_b64, last4_text, rotated_at, created_by_user_id)
  VALUES ('Anthropic Claude', ${enc.ciphertextB64}, ${enc.ivB64}, ${enc.authTagB64}, ${enc.last4}, NOW(), 'SEED_SCRIPT')
  RETURNING credential_id
`;

const [profile] = await sql`
  INSERT INTO bayanat.llm_provider_profiles
    (profile_name_text, provider_type_code, api_flavor_code, base_url_text, model_name_text, credential_id,
     max_tokens_int, temperature_number, timeout_seconds_int, is_enabled_indicator, is_default_indicator,
     allow_sample_values_indicator, notes_text)
  VALUES
    ('Anthropic Claude', 'MANAGED_API', 'ANTHROPIC', 'https://api.anthropic.com', 'claude-haiku-4-5-20251001', ${cred.credential_id},
     1024, 0.2, 30, true, true,
     false, 'Seeded from the pre-existing ANTHROPIC_API_KEY env var — kept as the working default in this environment since no self-hosted endpoint is deployed here yet.')
  RETURNING profile_id
`;

await sql`UPDATE bayanat.llm_provider_profiles SET is_default_indicator = false WHERE profile_id != ${profile.profile_id} AND is_default_indicator = true`;

console.log(`Seeded profile_id=${profile.profile_id} as the active default (credential ••••${enc.last4}).`);
await sql.end();
