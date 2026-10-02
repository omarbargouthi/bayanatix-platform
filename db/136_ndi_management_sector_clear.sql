-- "Management and Supporting Sector" (management_sector) has no English
-- equivalent for NDI 2026 (management_sector_en is 0% populated) -- unlike
-- Domain/Directory Type/Compliance Type, there's no admin-configured
-- lookup to resolve these raw values through, and some of them are not
-- even real sector names (a few are leftover implementation notes entered
-- in the wrong field, e.g. "Need Updated NORA Certificate from EA team").
-- User confirmed (2026-10-01): clear the field entirely rather than show
-- raw Arabic on an English UI -- there's no real content here worth
-- preserving/translating.
UPDATE bayanat.gov_compliance_requirements
SET management_sector = NULL
WHERE framework_id = 1 AND management_sector IS NOT NULL AND trim(management_sector) <> '';
