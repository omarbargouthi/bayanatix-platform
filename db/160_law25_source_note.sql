-- 160: Québec Law 25 — say where each requirement comes from, on the requirement itself.
-- The Act is written as sections; a section often bundles several obligations and gives
-- them no numbers of their own. Bayanis splits such a section into separately assessable
-- requirements (LAW25.s8-1, -2, -3). That sub-numbering is Bayanis's, not the Act's, so
-- each requirement now ends its supporting evidence with a "Source" line naming the
-- section and, where the section was split, which part of Bayanis's breakdown it is.
-- (The section reference was only in the guidance column, which the screens don't show.)
-- Safe to run more than once.

BEGIN;

WITH parsed AS (
  SELECT r.req_id,
         r.standard_code LIKE 'LAW25.sIT-%' AS is_it_act,
         split_part(regexp_replace(r.standard_code, '^LAW25\.s(IT-)?', ''), '-', 1) AS section,
         nullif(split_part(regexp_replace(r.standard_code, '^LAW25\.s(IT-)?', ''), '-', 2), '') AS item
  FROM bayanat.gov_compliance_requirements r
  WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'QC_LAW25')
    AND r.standard_code LIKE 'LAW25.s%'
), noted AS (
  SELECT p.req_id,
         'Source: ' ||
         CASE WHEN p.is_it_act THEN 'Act to establish a legal framework for information technology (CQLR c. C-1.1), s. ' || p.section
              ELSE 'Act respecting the protection of personal information in the private sector (CQLR c. P-39.1), s. ' || p.section END ||
         CASE WHEN p.item IS NULL THEN '.'
              ELSE '. Part ' || p.item || ' of ' || count(*) OVER (PARTITION BY p.is_it_act, p.section) ||
                   ' in Bayanis''s own breakdown of this section — the Act states these obligations together and does not number them separately.' END AS note
  FROM parsed p
)
UPDATE bayanat.gov_compliance_requirements r
SET supporting_evidence    = split_part(r.supporting_evidence,    E'\n\nSource: ', 1) || E'\n\n' || n.note,
    supporting_evidence_en = split_part(r.supporting_evidence_en, E'\n\nSource: ', 1) || E'\n\n' || n.note,
    guidance = n.note
FROM noted n
WHERE r.req_id = n.req_id;

COMMIT;
