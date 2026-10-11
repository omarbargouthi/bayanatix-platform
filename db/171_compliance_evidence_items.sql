-- 171: evidence on a compliance requirement becomes a list of items.
-- A requirement could hold one uploaded file (gov_compliance_assessments.evidence_name /
-- evidence_data), which could only be downloaded or silently overwritten. Evidence is now
-- any number of items per requirement, each either a document (stored here, with its
-- type and size so it can be previewed) or a link (a Bayanis page such as
-- /catalog/12/tables/34, or any http(s) address such as an intranet page), with a title
-- and a note that can be edited afterwards.
-- The one-file columns stay where they are and are no longer read; existing files are
-- copied into the new table.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_evidence_items (
  evidence_id        serial PRIMARY KEY,
  req_id             integer NOT NULL REFERENCES bayanat.gov_compliance_requirements(req_id) ON DELETE CASCADE,
  kind_code          varchar(10) NOT NULL CHECK (kind_code IN ('FILE', 'LINK')),
  title_text         varchar(300) NOT NULL,
  note_text          text,
  file_name          varchar(500),
  mime_type          varchar(200),
  file_size          integer,
  file_data          bytea,
  link_url           text,
  added_by_user_id   varchar(100),
  added_at           timestamp NOT NULL DEFAULT now(),
  updated_by_user_id varchar(100),
  updated_at         timestamp,
  -- Set only on rows copied from the old one-file column, so the copy is not repeated.
  is_migrated_legacy boolean NOT NULL DEFAULT false,
  CHECK ((kind_code = 'FILE' AND file_data IS NOT NULL AND file_name IS NOT NULL)
      OR (kind_code = 'LINK' AND link_url IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_gov_compliance_evidence_items_req ON bayanat.gov_compliance_evidence_items(req_id);

INSERT INTO bayanat.gov_compliance_evidence_items
  (req_id, kind_code, title_text, file_name, mime_type, file_size, file_data, added_by_user_id, added_at, is_migrated_legacy)
SELECT a.req_id, 'FILE', left(a.evidence_name, 300), a.evidence_name,
       CASE lower(substring(a.evidence_name from '\.([^.]+)$'))
         WHEN 'pdf'  THEN 'application/pdf'
         WHEN 'png'  THEN 'image/png'
         WHEN 'jpg'  THEN 'image/jpeg'
         WHEN 'jpeg' THEN 'image/jpeg'
         WHEN 'gif'  THEN 'image/gif'
         WHEN 'webp' THEN 'image/webp'
         WHEN 'txt'  THEN 'text/plain'
         WHEN 'csv'  THEN 'text/csv'
         WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
         WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
         WHEN 'pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
         ELSE 'application/octet-stream' END,
       octet_length(a.evidence_data), a.evidence_data, a.assessed_by, coalesce(a.assessed_at, now()), true
FROM bayanat.gov_compliance_assessments a
WHERE a.evidence_name IS NOT NULL AND a.evidence_data IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bayanat.gov_compliance_evidence_items e WHERE e.req_id = a.req_id AND e.is_migrated_legacy);

COMMIT;
