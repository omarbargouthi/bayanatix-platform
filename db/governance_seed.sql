-- Seed governance registers
INSERT INTO bayanat.gov_registers (name, description, is_system) VALUES
('Data Sources Register','Inventory of all organisational data sources and their metadata',TRUE),
('Ownership Appointment Register','Records of data asset ownership and stewardship appointments',TRUE),
('Steering Committee Meeting Register','Outcomes and action items from Data Governance Steering Committee meetings',TRUE),
('Training Plan Register','Training plans and completion records for data governance training',TRUE),
('Open Data Register','Datasets approved for public or open access publication',TRUE),
('Data Sharing Register','Data sharing agreements and records with third-party organisations',TRUE)
ON CONFLICT DO NOTHING;

-- Data Sources columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Source Name','source_name','TEXT',TRUE,NULL,1),
  ('Source Type','source_type','SELECT',FALSE,'["Database","API","File","Stream","Other"]',2),
  ('Owner','owner','TEXT',FALSE,NULL,3),
  ('Classification','classification','SELECT',FALSE,'["Public","Internal","Confidential","Restricted"]',4),
  ('Status','status','SELECT',FALSE,'["Active","Inactive","Deprecated"]',5),
  ('Last Updated','last_updated','DATE',FALSE,NULL,6),
  ('Notes','notes','TEXT',FALSE,NULL,7)
) v(n,k,t,req,o,s)
WHERE r.name='Data Sources Register' ON CONFLICT DO NOTHING;

-- Ownership columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Asset Name','asset_name','TEXT',TRUE,NULL,1),
  ('Asset Type','asset_type','SELECT',FALSE,'["Table","Schema","Column","Term","Source"]',2),
  ('Owner','owner','TEXT',TRUE,NULL,3),
  ('Business Steward','biz_steward','TEXT',FALSE,NULL,4),
  ('Technical Steward','tech_steward','TEXT',FALSE,NULL,5),
  ('Appointment Date','appointment_date','DATE',FALSE,NULL,6),
  ('Approved By','approved_by','TEXT',FALSE,NULL,7)
) v(n,k,t,req,o,s)
WHERE r.name='Ownership Appointment Register' ON CONFLICT DO NOTHING;

-- Steering Committee columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Meeting Date','meeting_date','DATE',TRUE,NULL,1),
  ('Meeting Title','title','TEXT',FALSE,NULL,2),
  ('Attendees','attendees','TEXT',FALSE,NULL,3),
  ('Agenda','agenda','TEXT',FALSE,NULL,4),
  ('Decisions Made','decisions','TEXT',FALSE,NULL,5),
  ('Action Items','action_items','TEXT',FALSE,NULL,6),
  ('Next Meeting Date','next_meeting','DATE',FALSE,NULL,7)
) v(n,k,t,req,o,s)
WHERE r.name='Steering Committee Meeting Register' ON CONFLICT DO NOTHING;

-- Training Plan columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Training Title','title','TEXT',TRUE,NULL,1),
  ('Target Audience','audience','TEXT',FALSE,NULL,2),
  ('Trainer','trainer','TEXT',FALSE,NULL,3),
  ('Scheduled Date','scheduled_date','DATE',FALSE,NULL,4),
  ('Completion Date','completion_date','DATE',FALSE,NULL,5),
  ('Status','status','SELECT',FALSE,'["Planned","In Progress","Completed","Cancelled"]',6),
  ('Notes','notes','TEXT',FALSE,NULL,7)
) v(n,k,t,req,o,s)
WHERE r.name='Training Plan Register' ON CONFLICT DO NOTHING;

-- Open Data columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Dataset Name','dataset_name','TEXT',TRUE,NULL,1),
  ('Description','description','TEXT',FALSE,NULL,2),
  ('License','license','SELECT',FALSE,'["CC0","CC-BY","CC-BY-SA","OGL","Other"]',3),
  ('Published Date','published_date','DATE',FALSE,NULL,4),
  ('URL','url','URL',FALSE,NULL,5),
  ('Status','status','SELECT',FALSE,'["Draft","Published","Deprecated"]',6)
) v(n,k,t,req,o,s)
WHERE r.name='Open Data Register' ON CONFLICT DO NOTHING;

-- Data Sharing columns
INSERT INTO bayanat.gov_register_columns (register_id,column_name,column_key,data_type,is_required,options,sort_order)
SELECT r.register_id,v.n,v.k,v.t,v.req,v.o::jsonb,v.s
FROM bayanat.gov_registers r, (VALUES
  ('Partner Organisation','partner','TEXT',TRUE,NULL,1),
  ('Data Shared','data_shared','TEXT',FALSE,NULL,2),
  ('Purpose','purpose','TEXT',FALSE,NULL,3),
  ('Agreement Date','agreement_date','DATE',FALSE,NULL,4),
  ('Expiry Date','expiry_date','DATE',FALSE,NULL,5),
  ('Status','status','SELECT',FALSE,'["Active","Expired","Pending","Terminated"]',6),
  ('Notes','notes','TEXT',FALSE,NULL,7)
) v(n,k,t,req,o,s)
WHERE r.name='Data Sharing Register' ON CONFLICT DO NOTHING;

-- NDI 2026 compliance framework
INSERT INTO bayanat.gov_compliance_frameworks (name,code,version,description)
VALUES ('National Data Index 2026','NDI_2026','2026','NDMO National Data Index assessment framework for organisational data maturity')
ON CONFLICT (code) DO NOTHING;

-- NDI 2026 requirements
INSERT INTO bayanat.gov_compliance_requirements (framework_id,req_code,category,sub_category,req_text,guidance,sort_order)
SELECT f.framework_id,v.c,v.cat,v.sub,v.txt,v.guide,v.s
FROM bayanat.gov_compliance_frameworks f, (VALUES
  ('DG-1.1','Data Governance','Framework','Data Governance Framework is documented and approved by senior management','Provide evidence of an approved Data Governance Framework document',10),
  ('DG-1.2','Data Governance','Framework','Data Governance policies are defined and communicated across the organisation','Provide approved policy documents and communication records',20),
  ('DG-1.3','Data Governance','Roles','Data ownership and stewardship roles are formally assigned','Provide ownership appointment register and role descriptions',30),
  ('DG-1.4','Data Governance','Roles','A Data Governance Committee or equivalent body has been established','Provide committee charter and meeting records',40),
  ('DG-1.5','Data Governance','Strategy','A Data Management Strategy aligned to organisational objectives exists','Provide approved Data Management Strategy document',50),
  ('DG-2.1','Data Governance','Compliance','Data compliance requirements (regulatory, contractual) are identified','Provide compliance register or regulatory mapping document',60),
  ('DG-2.2','Data Governance','Compliance','Processes exist to monitor and report on data governance compliance','Provide monitoring process documentation and sample reports',70),
  ('DG-2.3','Data Governance','Training','A data governance training programme is in place','Provide training plan and completion records',80),
  ('DQ-1.1','Data Quality','Rules','Data quality rules and standards are defined for critical data elements','Provide data quality rules documentation',90),
  ('DQ-1.2','Data Quality','Measurement','Data quality is measured and reported regularly','Provide data quality metrics reports',100),
  ('DQ-1.3','Data Quality','Remediation','A process exists to identify, report and remediate data quality issues','Provide issue management process documentation',110),
  ('DQ-1.4','Data Quality','Profiling','Data profiling is performed on critical data assets','Provide data profiling results or tool evidence',120),
  ('DQ-2.1','Data Quality','Improvement','A data quality improvement plan is maintained','Provide current data quality improvement roadmap',130),
  ('DCAT-1.1','Data Catalog','Inventory','An enterprise data inventory or catalog is maintained','Provide access to or evidence of the data catalog',140),
  ('DCAT-1.2','Data Catalog','Metadata','Business and technical metadata is captured for critical data assets','Provide sample metadata records from the catalog',150),
  ('DCAT-1.3','Data Catalog','Lineage','Data lineage is documented for critical data flows','Provide lineage diagrams or tool evidence',160),
  ('DCAT-2.1','Data Catalog','Glossary','A business glossary of critical data terms is maintained','Provide current business glossary',170),
  ('CLS-1.1','Classification','Framework','A data classification framework is defined and approved','Provide approved classification policy',180),
  ('CLS-1.2','Classification','Application','Data classification is applied to data assets','Provide evidence of classified assets in the catalog',190),
  ('CLS-1.3','Classification','Review','Data classification is reviewed periodically','Provide review schedule and records',200),
  ('PRIV-1.1','Privacy','Compliance','Personal data is identified and classified in accordance with PDPL','Provide PII inventory and classification evidence',210),
  ('PRIV-1.2','Privacy','Controls','Privacy controls are implemented for personal data processing','Provide privacy impact assessments and control documentation',220),
  ('PRIV-1.3','Privacy','Consent','Consent management processes are in place where required','Provide consent management documentation',230),
  ('ARCH-1.1','Data Architecture','Standards','Data architecture standards and principles are documented','Provide data architecture standards document',240),
  ('ARCH-1.2','Data Architecture','Models','Enterprise data models are maintained','Provide current data models or catalog evidence',250),
  ('ARCH-1.3','Data Architecture','Integration','Data integration standards are defined','Provide integration standards documentation',260),
  ('OPS-1.1','Data Operations','Processes','Data management operational processes are documented','Provide process documentation',270),
  ('OPS-1.2','Data Operations','SLA','Service levels for data management are defined and monitored','Provide SLA documentation and monitoring reports',280),
  ('SHARE-1.1','Data Sharing','Agreements','Data sharing agreements are in place for all external data sharing','Provide data sharing register and sample agreements',290),
  ('SHARE-1.2','Data Sharing','Controls','Controls exist to monitor and audit data sharing activities','Provide audit logs and monitoring evidence',300)
) v(c,cat,sub,txt,guide,s)
WHERE f.code='NDI_2026' ON CONFLICT DO NOTHING;

SELECT 'seed complete' AS result;
