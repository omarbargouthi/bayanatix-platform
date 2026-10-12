-- 173: attachments of a Governance Framework document become a list of items.
-- A document (policy, process, standard, …) could hold uploaded files only, which could
-- be counted but not listed, previewed, renamed or removed from the page. An attachment
-- is now either a stored file or a link (a Bayanis page such as /catalog/12/tables/34,
-- or any http(s) address), with a title and a note that can be edited afterwards — the
-- same shape as the evidence items of a compliance requirement (db/171).
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.gov_framework_attachments
  ADD COLUMN IF NOT EXISTS kind_code  varchar(10) NOT NULL DEFAULT 'FILE' CHECK (kind_code IN ('FILE', 'LINK')),
  ADD COLUMN IF NOT EXISTS title_text varchar(300),
  ADD COLUMN IF NOT EXISTS note_text  text,
  ADD COLUMN IF NOT EXISTS link_url   text,
  ADD COLUMN IF NOT EXISTS updated_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- A link has no file.
ALTER TABLE bayanat.gov_framework_attachments ALTER COLUMN file_name DROP NOT NULL;

UPDATE bayanat.gov_framework_attachments
SET title_text = left(file_name, 300)
WHERE title_text IS NULL AND file_name IS NOT NULL;

-- The stored type was whatever the browser claimed at upload; from now on the file
-- extension decides (lib/queries/compliance-evidence.ts), so existing rows follow suit.
UPDATE bayanat.gov_framework_attachments
SET file_mime_type = CASE lower(substring(file_name from '\.([^.]+)$'))
       WHEN 'pdf'  THEN 'application/pdf'
       WHEN 'png'  THEN 'image/png'
       WHEN 'jpg'  THEN 'image/jpeg'
       WHEN 'jpeg' THEN 'image/jpeg'
       WHEN 'gif'  THEN 'image/gif'
       WHEN 'webp' THEN 'image/webp'
       WHEN 'txt'  THEN 'text/plain'
       WHEN 'log'  THEN 'text/plain'
       WHEN 'md'   THEN 'text/plain'
       WHEN 'csv'  THEN 'text/csv'
       WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
       WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
       WHEN 'pptx' THEN 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
       ELSE 'application/octet-stream' END
WHERE kind_code = 'FILE' AND file_name IS NOT NULL;

COMMIT;
