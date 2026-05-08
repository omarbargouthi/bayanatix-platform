-- ─────────────────────────────────────────────────────────────────────────────
-- 003_dashboard_data.sql
-- Dashboard widget backing tables.
-- Edit the rows in this file (or INSERT/UPDATE directly) to change graph values.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Compliance snapshots ──────────────────────────────────────────────────────
-- One row per period.  The two most-recent rows drive the half-donut chart:
--   newest  = current value (the big %)
--   second  = previous value (used to compute the +/- delta badge)
CREATE TABLE IF NOT EXISTS bayanat.compliance_snapshots (
    snapshot_id  SERIAL       PRIMARY KEY,
    period_label TEXT         NOT NULL,          -- e.g. 'Q4 2025'
    period_date  DATE         NOT NULL,          -- first day of the period
    overall_pct  NUMERIC(5,1) NOT NULL,          -- 0 – 100
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── NDI / NAII maturity trend ─────────────────────────────────────────────────
-- One row per (year, month).  The chart always renders the most-recent complete
-- calendar year, showing NDI and NAII on a 1-5 scale.
CREATE TABLE IF NOT EXISTS bayanat.maturity_trends (
    trend_id    SERIAL       PRIMARY KEY,
    trend_year  INT          NOT NULL,
    trend_month INT          NOT NULL CHECK (trend_month BETWEEN 1 AND 12),
    ndi_score   NUMERIC(3,1) NOT NULL CHECK (ndi_score  BETWEEN 1 AND 5),
    naii_score  NUMERIC(3,1) NOT NULL CHECK (naii_score BETWEEN 1 AND 5),
    notes       TEXT,
    UNIQUE (trend_year, trend_month)
);

-- ── Recent asset visits ───────────────────────────────────────────────────────
-- Populated at runtime when a user views a table / column / glossary term.
-- The dashboard reads the 6 most-recent distinct assets per user.
CREATE TABLE IF NOT EXISTS bayanat.user_recent_assets (
    visit_id   SERIAL      PRIMARY KEY,
    user_id    TEXT        NOT NULL,
    asset_type TEXT        NOT NULL CHECK (asset_type IN ('TABLE','COLUMN','GLOSSARY')),
    asset_id   TEXT        NOT NULL,
    asset_name TEXT        NOT NULL,
    asset_meta TEXT,                             -- schema name or parent table
    row_count  BIGINT,                           -- optional, shown under the icon
    visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Search history ────────────────────────────────────────────────────────────
-- Populated at runtime when a user submits a search query.
-- The dashboard reads the 5 most-recent distinct queries per user.
CREATE TABLE IF NOT EXISTS bayanat.user_searches (
    search_id   SERIAL      PRIMARY KEY,
    user_id     TEXT        NOT NULL,
    query       TEXT        NOT NULL,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED DATA  (edit freely — these are the values shown in the UI)
-- ─────────────────────────────────────────────────────────────────────────────

-- Compliance snapshots: two periods so the delta badge is computed
INSERT INTO bayanat.compliance_snapshots (period_label, period_date, overall_pct) VALUES
    ('Q3 2025', '2025-07-01', 64.8),
    ('Q4 2025', '2025-10-01', 67.3);

-- Maturity trends: full-year 2025 (NDI & NAII, scale 1-5)
-- Update ndi_score / naii_score to change the trend lines
INSERT INTO bayanat.maturity_trends (trend_year, trend_month, ndi_score, naii_score) VALUES
    (2025,  1, 2.1, 1.7),
    (2025,  2, 2.2, 1.9),
    (2025,  3, 2.4, 2.0),
    (2025,  4, 2.5, 2.2),
    (2025,  5, 2.7, 2.4),
    (2025,  6, 2.9, 2.5),
    (2025,  7, 3.0, 2.7),
    (2025,  8, 3.2, 2.9),
    (2025,  9, 3.3, 3.0),
    (2025, 10, 3.5, 3.2),
    (2025, 11, 3.6, 3.4),
    (2025, 12, 3.8, 3.5)
ON CONFLICT (trend_year, trend_month) DO UPDATE
    SET ndi_score  = EXCLUDED.ndi_score,
        naii_score = EXCLUDED.naii_score;

-- Recent assets for demo user
INSERT INTO bayanat.user_recent_assets
    (user_id, asset_type, asset_id, asset_name, asset_meta, row_count, visited_at) VALUES
    ('khaled.almansour','TABLE',   '1','AR_INVOICES',    'AR_SCHEMA',   284000, NOW() - INTERVAL  '8 minutes'),
    ('khaled.almansour','TABLE',   '2','AR_MASTER',      'AR_SCHEMA',    52000, NOW() - INTERVAL  '2 hours'),
    ('khaled.almansour','COLUMN',  '3','invoice_id',     'AR_INVOICES',   NULL, NOW() - INTERVAL  '3 hours'),
    ('khaled.almansour','GLOSSARY','4','Invoice',         NULL,            NULL, NOW() - INTERVAL  '5 hours'),
    ('khaled.almansour','TABLE',   '5','AR_PAYMENTS',    'AR_SCHEMA',   130000, NOW() - INTERVAL  '1 day'),
    ('khaled.almansour','TABLE',   '6','AR_TRANSACTIONS','AR_SCHEMA',   760000, NOW() - INTERVAL  '2 days');

-- Recent searches for demo user
INSERT INTO bayanat.user_searches (user_id, query, searched_at) VALUES
    ('khaled.almansour', 'invoice tables',  NOW() - INTERVAL '25 minutes'),
    ('khaled.almansour', 'customer data',   NOW() - INTERVAL  '3 hours'),
    ('khaled.almansour', 'AR_INVOICES',     NOW() - INTERVAL  '1 day'),
    ('khaled.almansour', 'payment schema',  NOW() - INTERVAL  '2 days'),
    ('khaled.almansour', 'data quality',    NOW() - INTERVAL  '3 days');
