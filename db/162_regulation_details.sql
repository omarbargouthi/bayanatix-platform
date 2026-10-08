-- 162: regulation details on each framework / regulation.
-- Where it applies (region and countries), who issues or enforces it, since when, and
-- where the official text is. Shown under the regulation's name on the Compliance page
-- and editable there. The values below are a starting point entered by Bayanis from
-- public knowledge of each regulation — an organisation should confirm them against
-- the regulator's site; links point at the regulator's own domain.
-- Safe to run more than once: existing values are never overwritten.

BEGIN;

ALTER TABLE bayanat.gov_compliance_frameworks
  ADD COLUMN IF NOT EXISTS region_name          varchar(100),
  ADD COLUMN IF NOT EXISTS countries_in_scope   text,          -- comma-separated country / jurisdiction names
  ADD COLUMN IF NOT EXISTS scope_note           text,          -- who it applies to, in one or two sentences
  ADD COLUMN IF NOT EXISTS regulatory_body      text,
  ADD COLUMN IF NOT EXISTS effective_date       date,
  ADD COLUMN IF NOT EXISTS effective_date_note  text,          -- phases, deadlines, "issued in 2022"…
  ADD COLUMN IF NOT EXISTS official_url         text,
  ADD COLUMN IF NOT EXISTS reference_links      jsonb NOT NULL DEFAULT '[]'::jsonb;  -- [{"label": "...", "url": "..."}]

UPDATE bayanat.gov_compliance_frameworks f SET
  region_name         = coalesce(f.region_name, v.region_name),
  countries_in_scope  = coalesce(f.countries_in_scope, v.countries),
  scope_note          = coalesce(f.scope_note, v.scope_note),
  regulatory_body     = coalesce(f.regulatory_body, v.body),
  effective_date      = coalesce(f.effective_date, v.effective_date::date),
  effective_date_note = coalesce(f.effective_date_note, v.date_note),
  official_url        = coalesce(f.official_url, v.url),
  reference_links     = CASE WHEN f.reference_links = '[]'::jsonb THEN v.links::jsonb ELSE f.reference_links END
FROM (VALUES
  ('PDPL', 'Middle East', 'Saudi Arabia',
   $t$Any processing of personal data that takes place in the Kingdom, and processing outside it of the personal data of individuals residing in the Kingdom.$t$,
   $t$Saudi Data & AI Authority (SDAIA)$t$, '2023-09-14',
   $t$Issued by Royal Decree M/19 (2021) and amended by Royal Decree M/148 (2023). In force from 14 September 2023, with a one-year period to comply ending 14 September 2024.$t$,
   'https://sdaia.gov.sa', $j$[{"label":"SDAIA data governance platform","url":"https://dgp.sdaia.gov.sa"}]$j$),
  ('NDI_2026', 'Middle East', 'Saudi Arabia',
   $t$Saudi government entities, measured each cycle on data management maturity, compliance and operational excellence.$t$,
   $t$Saudi Data & AI Authority (SDAIA) — National Data Management Office (NDMO)$t$, NULL,
   $t$Measured in annual cycles; this is the 2026 version of the index.$t$,
   'https://sdaia.gov.sa', '[]'),
  ('NDI_OPS_EXCELLENCE', 'Middle East', 'Saudi Arabia',
   $t$Saudi government entities — the operational excellence indicators of the National Data Index, measured from the national data platforms.$t$,
   $t$Saudi Data & AI Authority (SDAIA) — National Data Management Office (NDMO)$t$, NULL,
   $t$Measured in the same annual cycles as the National Data Index.$t$,
   'https://sdaia.gov.sa', '[]'),
  ('NAII', 'Middle East', 'Saudi Arabia',
   $t$Saudi government entities, measured on their readiness for and adoption of artificial intelligence.$t$,
   $t$Saudi Data & AI Authority (SDAIA)$t$, NULL, NULL,
   'https://sdaia.gov.sa', '[]'),
  ('AI_ETHICS', 'Middle East', 'Saudi Arabia',
   $t$Entities in the Kingdom that design, develop, deploy or use AI systems, across the AI system life cycle.$t$,
   $t$Saudi Data & AI Authority (SDAIA)$t$, NULL,
   $t$AI Ethics Principles, version 1.0, published in September 2023.$t$,
   'https://sdaia.gov.sa', '[]'),
  ('DCC', 'Middle East', 'Saudi Arabia',
   $t$Government entities in the Kingdom and private-sector entities that own, operate or host critical national infrastructure, for data across its life cycle.$t$,
   $t$National Cybersecurity Authority (NCA)$t$, NULL,
   $t$Data Cybersecurity Controls DCC-1:2022, issued in 2022 as an extension of the Essential Cybersecurity Controls.$t$,
   'https://nca.gov.sa', '[]'),
  ('CST', 'Middle East', 'Saudi Arabia',
   $t$Service providers licensed in the communications, information technology and postal sectors, for their customers' personal data.$t$,
   $t$Communications, Space & Technology Commission (CST), formerly CITC$t$, NULL,
   $t$General Principles for Personal Data Protection, issued by the Commission (then CITC) in 2020.$t$,
   'https://www.cst.gov.sa', '[]'),
  ('QAYAS', 'Middle East', 'Saudi Arabia',
   $t$Saudi government entities, as part of the periodic measurement of their digital transformation.$t$,
   $t$Digital Government Authority (DGA)$t$, NULL, NULL,
   'https://dga.gov.sa', '[]'),
  ('BCBS239', 'Global', 'Basel Committee member jurisdictions',
   $t$Global systemically important banks, and domestic systemically important banks as designated by their national supervisor; applied at group and material-entity level.$t$,
   $t$Basel Committee on Banking Supervision (BCBS), applied by national banking supervisors$t$, '2016-01-01',
   $t$Published in January 2013. Global systemically important banks were expected to comply by 1 January 2016; domestic ones within three years of designation.$t$,
   'https://www.bis.org/publ/bcbs239.htm', $j$[{"label":"Basel Committee on Banking Supervision","url":"https://www.bis.org/bcbs/"}]$j$),
  ('PIPEDA', 'North America', 'Canada',
   $t$Private-sector organizations across Canada that collect, use or disclose personal information in the course of commercial activities, and federally regulated businesses. Provinces with substantially similar laws (Québec, Alberta, British Columbia) apply their own within the province.$t$,
   $t$Office of the Privacy Commissioner of Canada (OPC)$t$, '2001-01-01',
   $t$Royal assent 13 April 2000. In force in stages from 1 January 2001, applying to all covered organizations from 1 January 2004.$t$,
   'https://laws-lois.justice.gc.ca/eng/acts/P-8.6/', $j$[{"label":"Office of the Privacy Commissioner of Canada","url":"https://www.priv.gc.ca"}]$j$),
  ('QC_LAW25', 'North America', 'Canada (Québec)',
   $t$Enterprises that collect, hold, use or communicate personal information in the course of carrying on an enterprise in Québec, wherever the enterprise is established.$t$,
   $t$Commission d'accès à l'information du Québec (CAI)$t$, '2023-09-22',
   $t$Law 25 was assented to on 22 September 2021 and came into force in three stages: 22 September 2022, 22 September 2023 (most provisions) and 22 September 2024 (data portability).$t$,
   'https://www.legisquebec.gouv.qc.ca/en/document/cs/P-39.1', $j$[{"label":"Commission d'accès à l'information du Québec","url":"https://www.cai.gouv.qc.ca"}]$j$)
) AS v(code, region_name, countries, scope_note, body, effective_date, date_note, url, links)
WHERE f.code = v.code;

COMMIT;
