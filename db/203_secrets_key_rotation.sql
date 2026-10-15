-- 203: Encryption key rotation (lib/secrets.ts, lib/secrets-rotation.ts).
-- bayanat.llm_credentials keeps each secret as one self-describing string, like the
-- data source passwords in connection_registry.password_text, so a value can name
-- the key (and later the backend, e.g. Vault) that sealed it. Existing rows are
-- converted without decrypting: "enc:v1:<iv>:<authTag>:<ciphertext>" is the same
-- AES-256-GCM value, read with the same key. Re-encryption from Configuration ›
-- Encryption Keys then rewrites them as "enc:v2:<keyId>:...".
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.llm_credentials ADD COLUMN IF NOT EXISTS sealed_text text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'bayanat' AND table_name = 'llm_credentials' AND column_name = 'ciphertext_b64') THEN
    EXECUTE $q$
      UPDATE bayanat.llm_credentials
      SET sealed_text = 'enc:v1:' || iv_b64 || ':' || auth_tag_b64 || ':' || ciphertext_b64
      WHERE sealed_text IS NULL
    $q$;
    ALTER TABLE bayanat.llm_credentials DROP COLUMN ciphertext_b64, DROP COLUMN iv_b64, DROP COLUMN auth_tag_b64;
  END IF;
END $$;

ALTER TABLE bayanat.llm_credentials ALTER COLUMN sealed_text SET NOT NULL;

COMMIT;
