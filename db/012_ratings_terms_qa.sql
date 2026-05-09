-- Business term links for any asset type (multi-term per asset)
CREATE TABLE IF NOT EXISTS bayanat.asset_business_terms (
  abt_id          SERIAL PRIMARY KEY,
  asset_type_code VARCHAR(30) NOT NULL,
  asset_id        INTEGER NOT NULL,
  glossary_id     INTEGER NOT NULL REFERENCES bayanat.business_glossaries(glossary_id) ON DELETE CASCADE,
  linked_by       VARCHAR(50) REFERENCES bayanat.users(user_id),
  linked_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (asset_type_code, asset_id, glossary_id)
);
CREATE INDEX IF NOT EXISTS idx_abt_asset ON bayanat.asset_business_terms (asset_type_code, asset_id);

-- Star ratings per user per asset
CREATE TABLE IF NOT EXISTS bayanat.asset_ratings (
  rating_id       SERIAL PRIMARY KEY,
  asset_type_code VARCHAR(30) NOT NULL,
  asset_id        INTEGER NOT NULL,
  user_id         VARCHAR(50) NOT NULL REFERENCES bayanat.users(user_id),
  stars           SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         TEXT,
  rated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (asset_type_code, asset_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_asset ON bayanat.asset_ratings (asset_type_code, asset_id);

-- Enhance collab_threads: thread type (DISCUSSION / QUESTION) and status (OPEN / CLOSED)
ALTER TABLE bayanat.collab_threads
  ADD COLUMN IF NOT EXISTS thread_type VARCHAR(20) NOT NULL DEFAULT 'DISCUSSION'
    CHECK (thread_type IN ('DISCUSSION','QUESTION')),
  ADD COLUMN IF NOT EXISTS status_code VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status_code IN ('OPEN','CLOSED')),
  ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by  VARCHAR(50) REFERENCES bayanat.users(user_id);
