-- Data subject requests (PDPL data subject rights): access, correction, erasure
-- (destruction) and restriction requests, answered by following the retention
-- configuration — a category's master table (identity root + natural key), its
-- registered relationships to child tables, the PI columns of every table on that
-- path, the category's schedule and active legal holds.
--
-- Privacy by design: Bayanis never stores the data subject's identity or values.
-- The request carries only an external reference; the manifest's locate queries
-- take the identifier as a parameter (:subject_identifier) that the team executing
-- the request supplies. Execution happens outside Bayanis, like retention purges.

CREATE TABLE IF NOT EXISTS bayanat.data_subject_requests (
  request_id              serial PRIMARY KEY,
  reference_code          varchar(30) NOT NULL UNIQUE,              -- DSR-2026-0001
  request_type            varchar(20) NOT NULL CHECK (request_type IN ('ACCESS', 'CORRECTION', 'ERASURE', 'RESTRICTION')),
  category_id             integer NOT NULL REFERENCES bayanat.data_categories(category_id),
  identifier_attribute_id integer NOT NULL REFERENCES bayanat.data_attributes(attribute_id),
  external_reference      varchar(200),                              -- ticket / case number (no personal data)
  channel                 varchar(30),                               -- EMAIL / PORTAL / LETTER / PHONE / IN_PERSON / OTHER
  received_date           date NOT NULL DEFAULT CURRENT_DATE,
  due_date                date NOT NULL,
  status_code             varchar(20) NOT NULL DEFAULT 'OPEN' CHECK (status_code IN ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED')),
  extension_reason        text,
  correction_details      text,                                      -- what to correct (no values)
  notes                   text,
  response_summary        text,
  created_by_user_id      varchar(100) REFERENCES bayanat.users(user_id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  completed_at            timestamptz,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dsr_status ON bayanat.data_subject_requests (status_code, due_date);

-- One row per table on the request's path: what to do there, and whether it's done.
CREATE TABLE IF NOT EXISTS bayanat.data_subject_request_items (
  item_id            serial PRIMARY KEY,
  request_id         integer NOT NULL REFERENCES bayanat.data_subject_requests(request_id) ON DELETE CASCADE,
  entity_id          integer NOT NULL REFERENCES bayanat.data_entities(entity_id) ON DELETE CASCADE,
  action_code        varchar(20) NOT NULL,                           -- EXTRACT / CORRECT / RESTRICT / DELETE / ANONYMIZE / ARCHIVE / RETAIN
  status_code        varchar(20) NOT NULL DEFAULT 'PENDING' CHECK (status_code IN ('PENDING', 'DONE', 'NOT_FOUND', 'EXEMPT')),
  pi_column_count    integer NOT NULL DEFAULT 0,
  note               text,
  updated_by_user_id varchar(100) REFERENCES bayanat.users(user_id),
  updated_at         timestamptz,
  UNIQUE (request_id, entity_id)
);
