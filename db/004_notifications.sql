-- ─────────────────────────────────────────────────────────────────────────────
-- 004_notifications.sql
-- Notification inbox backing table.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bayanat.notifications (
    notification_id SERIAL       PRIMARY KEY,
    user_id         TEXT         NOT NULL,
    type            TEXT         NOT NULL,  -- REVIEW | CERTIFICATION | CLASSIFICATION | QUALITY | WORKFLOW
    title           TEXT         NOT NULL,
    body            TEXT,
    is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
    severity        TEXT         NOT NULL DEFAULT 'INFO',  -- INFO | SUCCESS | WARNING | ERROR
    domain_code     TEXT,
    action_label    TEXT,                  -- optional CTA button text
    action_href     TEXT,                  -- optional CTA URL
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notif_user_idx ON bayanat.notifications (user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SEED  (edit freely to change notification content)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO bayanat.notifications
    (user_id, type, title, body, severity, domain_code, action_label, action_href, created_at) VALUES
    (
        'khaled.almansour', 'REVIEW',
        'Agency review is in progress',
        'AR_INVOICES dataset review has been initiated by Sara Al-Rashidi and is awaiting your input.',
        'INFO', 'DCAT', 'View Review', '/catalog/1/tables/1',
        NOW() - INTERVAL '2 hours'
    ),
    (
        'khaled.almansour', 'CERTIFICATION',
        'Dataset certification approved',
        'AR_MASTER has been awarded GOLD certification — 100% audit complete.',
        'SUCCESS', 'DCAT', 'View Asset', '/catalog/1',
        NOW() - INTERVAL '5 hours'
    ),
    (
        'khaled.almansour', 'CLASSIFICATION',
        'Classification review needed',
        'AR_TRANSACTIONS has 3 unclassified PII columns pending review before the compliance deadline.',
        'WARNING', 'CLASS', 'Review Now', '/catalog/1/tables/4',
        NOW() - INTERVAL '1 day'
    ),
    (
        'khaled.almansour', 'QUALITY',
        'Data quality threshold breached',
        'AR_PAYMENTS quality score dropped to 64% — 12 rules failing. Immediate action required.',
        'ERROR', 'DQ', 'View Report', '/catalog/1/tables/3',
        NOW() - INTERVAL '2 days'
    ),
    (
        'khaled.almansour', 'WORKFLOW',
        'FOI request assigned to you',
        'Request #FOI-2025-089 has been routed to you for approval. SLA deadline: Dec 31.',
        'WARNING', 'FOI', 'Open Request', '/foi',
        NOW() - INTERVAL '3 days'
    ),
    (
        'sara.alrashidi', 'REVIEW',
        'New dataset submitted for review',
        'Khaled Al-Mansour submitted AR_AGING for stewardship review.',
        'INFO', 'DCAT', 'Start Review', '/catalog/1',
        NOW() - INTERVAL '1 hour'
    );
