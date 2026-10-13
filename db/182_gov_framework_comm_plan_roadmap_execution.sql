-- 182: Governance Framework — two new sections (Operating Model, Communication Plan),
-- sections that can be hidden, the Communication Plan's scheduled events, and the
-- execution side of a roadmap (milestones and deliverables with a status).
-- Safe to run more than once.

BEGIN;

-- Two more sections.
ALTER TABLE bayanat.gov_framework_docs DROP CONSTRAINT IF EXISTS gov_framework_docs_section_code_check;
ALTER TABLE bayanat.gov_framework_docs ADD CONSTRAINT gov_framework_docs_section_code_check
  CHECK (section_code = ANY (ARRAY['POLICY','PROCESS','STRATEGY','OPERATING_MODEL','ROADMAP','STANDARD','TRAINING','COMMUNICATION','REGULATORY']));

-- A roadmap is for a domain: metadata, data quality, or any other (free text).
ALTER TABLE bayanat.gov_framework_docs ADD COLUMN IF NOT EXISTS domain_text text;

-- A section the organization does not use can be hidden. No row = shown.
CREATE TABLE IF NOT EXISTS bayanat.gov_framework_section_settings (
  section_code     text PRIMARY KEY,
  hidden_indicator boolean NOT NULL DEFAULT false,
  updated_by       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The Communication Plan's schedule: training and awareness sessions, updates on a
-- policy, procedure, strategy or roadmap, key events and announcements.
CREATE TABLE IF NOT EXISTS bayanat.gov_comm_events (
  event_id           serial PRIMARY KEY,
  title              text NOT NULL,
  description        text,
  event_type_code    text NOT NULL DEFAULT 'ANNOUNCEMENT'
    CHECK (event_type_code IN ('TRAINING','AWARENESS','POLICY_UPDATE','PROCEDURE_UPDATE','STRATEGY_UPDATE','ROADMAP_UPDATE','KEY_EVENT','ANNOUNCEMENT')),
  event_date         date NOT NULL,
  end_date           date,
  time_text          text,          -- e.g. "10:00 – 11:30"
  location_text      text,          -- a room, or a meeting link
  audience_text      text,          -- who it is for
  channel_text       text,          -- how it is communicated: e-mail, town hall, intranet…
  status_code        text NOT NULL DEFAULT 'PLANNED' CHECK (status_code IN ('PLANNED','DONE','CANCELLED')),
  announce_indicator boolean NOT NULL DEFAULT true,   -- shown on the Dashboard while upcoming
  owner_user_id      text,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_comm_events_date_idx ON bayanat.gov_comm_events (event_date);

-- Roadmap execution: the milestones of a roadmap document and the deliverables under
-- them (a deliverable may also hang directly on the roadmap).
CREATE TABLE IF NOT EXISTS bayanat.gov_roadmap_items (
  item_id            serial PRIMARY KEY,
  doc_id             integer NOT NULL REFERENCES bayanat.gov_framework_docs(doc_id) ON DELETE CASCADE,
  parent_item_id     integer REFERENCES bayanat.gov_roadmap_items(item_id) ON DELETE CASCADE,
  item_type_code     text NOT NULL DEFAULT 'MILESTONE' CHECK (item_type_code IN ('MILESTONE','DELIVERABLE')),
  title              text NOT NULL,
  description        text,
  status_code        text NOT NULL DEFAULT 'NOT_STARTED'
    CHECK (status_code IN ('NOT_STARTED','IN_PROGRESS','COMPLETED','DELAYED','ON_HOLD','CANCELLED')),
  due_date           date,
  completed_date     date,
  owner_text         text,
  announce_indicator boolean NOT NULL DEFAULT false,  -- shown on the Dashboard when due soon or just completed
  sort_order         integer NOT NULL DEFAULT 0,
  created_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gov_roadmap_items_doc_idx ON bayanat.gov_roadmap_items (doc_id);

COMMIT;
