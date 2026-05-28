-- Domain configuration: replaces hardcoded DOMAIN_EN_BY_CODE map in the frontend

CREATE TABLE IF NOT EXISTS bayanat.gov_compliance_domain_config (
  config_id    SERIAL  PRIMARY KEY,
  framework_id INT     NOT NULL REFERENCES bayanat.gov_compliance_frameworks(framework_id) ON DELETE CASCADE,
  domain_code  TEXT    NOT NULL,
  name_en      TEXT    NOT NULL DEFAULT '',
  name_ar      TEXT,
  sort_order   INT     NOT NULL DEFAULT 0,
  UNIQUE (framework_id, domain_code)
);

-- Seed from existing requirements using the known NDI code → English mapping
INSERT INTO bayanat.gov_compliance_domain_config
  (framework_id, domain_code, name_en, name_ar, sort_order)
SELECT DISTINCT ON (r.framework_id, COALESCE(r.domain_code, 'GEN'))
  r.framework_id,
  COALESCE(r.domain_code, 'GEN') AS domain_code,
  CASE COALESCE(r.domain_code, 'GEN')
    WHEN 'DG'  THEN 'Data Governance Domain'
    WHEN 'DSI' THEN 'Data Sharing and Integration Domain (DSI)'
    WHEN 'RMD' THEN 'Reference and Master Data Domain (RMD)'
    WHEN 'DQ'  THEN 'Data Quality Domain'
    WHEN 'BIA' THEN 'Business Intelligence and Analytics Domain (BIA)'
    WHEN 'DAM' THEN 'Data Architecture and Modelling Domain'
    WHEN 'MCM' THEN 'Metadata and Data Catalog Management Domain (MCM)'
    WHEN 'DVR' THEN 'Data Value Realisation Domain'
    WHEN 'OD'  THEN 'Open Data Domain'
    WHEN 'DC'  THEN 'Data Classification Domain'
    WHEN 'FOI' THEN 'Freedom of Information Domain'
    WHEN 'DO'  THEN 'Data Operations Domain'
    WHEN 'DCM' THEN 'Documents and Content Management Domain (DCM)'
    WHEN 'PDP' THEN 'Personal Data Protection Domain'
    ELSE COALESCE(r.domain_en, r.domain, r.domain_code, 'Unknown Domain')
  END AS name_en,
  r.domain AS name_ar,
  ROW_NUMBER() OVER (PARTITION BY r.framework_id ORDER BY COALESCE(r.domain_code, ''))::int AS sort_order
FROM bayanat.gov_compliance_requirements r
WHERE r.domain_code IS NOT NULL
ON CONFLICT (framework_id, domain_code) DO NOTHING;
