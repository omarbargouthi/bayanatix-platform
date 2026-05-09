-- Collaboration threads, messages, and asset refs

CREATE TABLE IF NOT EXISTS bayanat.collab_threads (
  thread_id   SERIAL       PRIMARY KEY,
  title       TEXT         NOT NULL,
  created_by  TEXT         NOT NULL REFERENCES bayanat.users(user_id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bayanat.collab_messages (
  message_id  SERIAL       PRIMARY KEY,
  thread_id   INT          NOT NULL REFERENCES bayanat.collab_threads(thread_id) ON DELETE CASCADE,
  author_id   TEXT         NOT NULL REFERENCES bayanat.users(user_id),
  body        TEXT         NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Bump thread.updated_at whenever a new message arrives
CREATE OR REPLACE FUNCTION bayanat.fn_collab_thread_touch()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bayanat.collab_threads SET updated_at = NOW() WHERE thread_id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collab_thread_touch ON bayanat.collab_messages;
CREATE TRIGGER trg_collab_thread_touch
  AFTER INSERT ON bayanat.collab_messages
  FOR EACH ROW EXECUTE FUNCTION bayanat.fn_collab_thread_touch();

-- Denormalised asset refs extracted from message bodies for cross-linking
CREATE TABLE IF NOT EXISTS bayanat.collab_asset_refs (
  ref_id      SERIAL  PRIMARY KEY,
  thread_id   INT     NOT NULL REFERENCES bayanat.collab_threads(thread_id) ON DELETE CASCADE,
  message_id  INT     REFERENCES bayanat.collab_messages(message_id) ON DELETE SET NULL,
  asset_type  TEXT    NOT NULL,
  asset_id    TEXT    NOT NULL,
  asset_path  TEXT    NOT NULL
);

-- ── Seed data ────────────────────────────────────────────────────────────────

INSERT INTO bayanat.collab_threads (thread_id, title, created_by, created_at, updated_at) VALUES
  (1, 'Data quality review - AR_INVOICES table',              'khaled.almansour', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 hour'),
  (2, 'Business term clarification: Customer Lifetime Value',  'sara.alqahtani',   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 hours'),
  (3, 'Schema naming conventions for Finance domain',          'mohammed.nasser',  NOW() - INTERVAL '1 day',  NOW() - INTERVAL '4 hours')
ON CONFLICT DO NOTHING;

SELECT setval('bayanat.collab_threads_thread_id_seq', 10);

INSERT INTO bayanat.collab_messages (thread_id, author_id, body, created_at) VALUES
  (1, 'khaled.almansour',
   'We need to review the data quality rules for #asset[Finance DB > AR Schema > AR_INVOICES|TABLE|1:1]. The null rate on invoice_total is above the accepted threshold. #user[sara.alqahtani|Sara Al-Qahtani] can you review the stewardship rules and update the DQ policy?',
   NOW() - INTERVAL '3 days'),
  (1, 'sara.alqahtani',
   'Thanks for flagging this. I reviewed #asset[Finance DB > AR Schema > AR_INVOICES|TABLE|1:1] - the issue is that invoice_total allows NULLs for draft invoices. We should add a conditional check. I will update the business rule.',
   NOW() - INTERVAL '1 hour'),
  (2, 'sara.alqahtani',
   'The definition of #asset[Finance > Customer Lifetime Value|GLOSSARY_TERM|7] needs to align with the new CLV formula adopted last quarter. #user[mohammed.nasser|Mohammed Nasser] can you confirm the updated formula?',
   NOW() - INTERVAL '2 days'),
  (3, 'mohammed.nasser',
   'Proposal: all Finance schemas should follow the naming pattern FINANCE_DOMAIN_SCHEMA. This affects #asset[Finance DB > AR Schema|SCHEMA|1]. #user[khaled.almansour|Khaled Al-Mansour] please review and share your vote before Friday.',
   NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

SELECT setval('bayanat.collab_messages_message_id_seq', 20);

INSERT INTO bayanat.collab_asset_refs (thread_id, asset_type, asset_id, asset_path) VALUES
  (1, 'TABLE',        '1:1', 'Finance DB > AR Schema > AR_INVOICES'),
  (2, 'GLOSSARY_TERM','7',   'Finance > Customer Lifetime Value'),
  (3, 'SCHEMA',       '1',   'Finance DB > AR Schema')
ON CONFLICT DO NOTHING;
