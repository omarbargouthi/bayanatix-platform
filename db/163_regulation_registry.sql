-- 163: Governance Framework > Regulatory is the registry of regulations and frameworks.
-- Until now a regulation existed twice with nothing tying the two together: as a
-- document on the Regulatory page (gov_framework_docs) and as an assessable regulation
-- on the Compliance / configuration pages (gov_compliance_frameworks) — three of them
-- under different names, the rest missing from the Regulatory page altogether.
-- Each Regulatory entry now points at its regulation (framework_id), carries the same
-- name, version, description, effective date and official link, and every regulation
-- has an entry. From here on the application keeps the two in step whichever page a
-- regulation is added or edited on.
-- Safe to run more than once.

BEGIN;

ALTER TABLE bayanat.gov_framework_docs
  ADD COLUMN IF NOT EXISTS framework_id integer UNIQUE
    REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE SET NULL;

-- 1. The three entries that already describe an existing regulation.
UPDATE bayanat.gov_framework_docs d
SET framework_id = f.framework_id
FROM bayanat.gov_compliance_frameworks f
WHERE d.section_code = 'REGULATORY' AND d.framework_id IS NULL
  AND ( (f.code = 'PDPL' AND d.title ILIKE '%PDPL%')
     OR (f.code = 'DCC'  AND d.title ILIKE '%(DCC)%')
     OR (f.code = 'CST'  AND d.title ILIKE 'CST %') )
  AND NOT EXISTS (SELECT 1 FROM bayanat.gov_framework_docs x WHERE x.framework_id = f.framework_id);

-- 2. Anything only the Regulatory entry knew is kept on the regulation…
UPDATE bayanat.gov_compliance_frameworks f
SET description    = coalesce(nullif(f.description, ''), d.description),
    version        = coalesce(nullif(f.version, ''), d.version_text),
    effective_date = coalesce(f.effective_date, d.effective_date),
    official_url   = coalesce(nullif(f.official_url, ''), d.source_url)
FROM bayanat.gov_framework_docs d
WHERE d.framework_id = f.framework_id;

-- …and the entry then shows exactly what the regulation says (one name everywhere).
UPDATE bayanat.gov_framework_docs d
SET title = f.name, description = f.description, version_text = f.version,
    effective_date = f.effective_date, source_url = f.official_url
FROM bayanat.gov_compliance_frameworks f
WHERE d.framework_id = f.framework_id;

-- 3. A Regulatory entry for every regulation that had none.
INSERT INTO bayanat.gov_framework_docs
  (section_code, title, description, status_code, version_text, effective_date, source_url, created_by, framework_id)
SELECT 'REGULATORY', f.name, f.description, 'APPROVED', f.version, f.effective_date, f.official_url, NULL, f.framework_id
FROM bayanat.gov_compliance_frameworks f
WHERE NOT EXISTS (SELECT 1 FROM bayanat.gov_framework_docs d WHERE d.framework_id = f.framework_id);

COMMIT;
