-- 161: generic supporting evidence for four frameworks that had none
-- (BCBS 239, CST, NDI Operational Excellence, AI Ethics — 101 requirements).
-- For each requirement: what an assessor would expect to see to accept it as met. This
-- is Bayanis's own generic guidance, not text from the regulator. It fills the field
-- only where it is empty, so wording an organisation has already entered is kept, and
-- an assessment can still override it per requirement (supporting_evidence_override).
-- Safe to run more than once.

BEGIN;

-- BCBS239: 14 requirements
UPDATE bayanat.gov_compliance_requirements r
SET supporting_evidence    = CASE WHEN coalesce(r.supporting_evidence, '') = '' THEN v.evidence ELSE r.supporting_evidence END,
    supporting_evidence_en = v.evidence
FROM (VALUES
  ($c$BCBS239-P1$c$, $t$Board-approved risk data aggregation and reporting framework; governance charter with named owners; independent validation or internal audit reports; evidence that new initiatives (acquisitions, new products, IT change) are assessed for their impact on aggregation.$t$),
  ($c$BCBS239-P2$c$, $t$Enterprise data architecture and data model; integrated data taxonomy and group-wide identifiers (legal entity, counterparty, account); named data owners; business continuity and disaster recovery tests showing aggregation and reporting work under stress.$t$),
  ($c$BCBS239-P3$c$, $t$Reconciliations of risk data to accounting and source systems; data dictionary; inventory of manual processes and end-user computing with their controls; data quality measurements and error logs; documented degree of automation.$t$),
  ($c$BCBS239-P4$c$, $t$Coverage map of material risk data across the group, including off-balance-sheet exposures; sample aggregations by business line, legal entity, asset type, industry and region; list of known gaps with their materiality and remediation plan.$t$),
  ($c$BCBS239-P5$c$, $t$Documented timeliness requirements for normal and stress conditions per risk type; measured production times against them; results of stress or crisis drills producing critical exposures quickly.$t$),
  ($c$BCBS239-P6$c$, $t$Examples of ad hoc and on-demand risk data requests met, with turnaround times; evidence of customisable aggregation (drill-down, new groupings) and of adapting to regulatory or organisational change.$t$),
  ($c$BCBS239-P7$c$, $t$Report reconciliation and validation procedures; automated and manual edit checks with their rule inventory; exception reports and how they were resolved; stated accuracy tolerances approved by senior management.$t$),
  ($c$BCBS239-P8$c$, $t$Inventory of risk management reports mapped to material risk areas (credit, market, liquidity, operational and others); evidence that scope matches the bank's risk profile; forward-looking content such as forecasts and stress tests.$t$),
  ($c$BCBS239-P9$c$, $t$Sample board and senior management risk reports; recipient feedback or periodic usefulness reviews; evidence that reports balance data, analysis and qualitative explanation and are tailored to each audience.$t$),
  ($c$BCBS239-P10$c$, $t$Board or senior management decision setting report frequency per report type; production calendar and on-time delivery record; evidence that frequency increases in stress or crisis.$t$),
  ($c$BCBS239-P11$c$, $t$Distribution lists per report with approval; access controls and confidentiality markings; procedures ensuring timely delivery to the right recipients; records of distribution reviews.$t$),
  ($c$BCBS239-P12$c$, $t$Addressed to supervisors rather than the bank. Keep on file: supervisory review letters and findings on these Principles, the bank's self-assessment, and the status of agreed remediation actions.$t$),
  ($c$BCBS239-P13$c$, $t$Addressed to supervisors rather than the bank. Keep on file: remediation plans requested by the supervisor, progress reports submitted, and evidence that deadlines were met.$t$),
  ($c$BCBS239-P14$c$, $t$Addressed to supervisors rather than the bank. Keep on file: correspondence with home and host supervisors on these Principles and any coordinated remedial actions affecting group entities.$t$)
) AS v(req_code, evidence)
WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'BCBS239')
  AND r.req_code = v.req_code
  AND coalesce(r.supporting_evidence_en, '') = '';

-- CST: 19 requirements
UPDATE bayanat.gov_compliance_requirements r
SET supporting_evidence    = CASE WHEN coalesce(r.supporting_evidence, '') = '' THEN v.evidence ELSE r.supporting_evidence END,
    supporting_evidence_en = v.evidence
FROM (VALUES
  ($c$CST-1$c$, $t$Third-party processor inventory; contracts with data protection clauses; periodic compliance verification reports or audits of each processor; follow-up of findings.$t$),
  ($c$CST-2$c$, $t$Record of processing listing the specified purpose for each processing activity; the customer-facing notice where those purposes are stated clearly.$t$),
  ($c$CST-3$c$, $t$Data-minimisation review of collection forms and systems showing each element is necessary for the stated purpose; fields removed as a result.$t$),
  ($c$CST-4$c$, $t$Retention schedule for customer personal data; deletion or anonymisation logs showing data is not kept in identifiable form beyond the period needed.$t$),
  ($c$CST-5$c$, $t$Security controls protecting customer personal data (access control, encryption, logging, monitoring); risk assessment; results of security testing and access reviews.$t$),
  ($c$CST-6$c$, $t$The documented privacy program: approved policies and procedures, implementation plan, enforcement and monitoring records, training and awareness records.$t$),
  ($c$CST-7$c$, $t$Organisation chart and charter of the independent function responsible for customer personal data protection; appointment decision; budget and resources allocated to it.$t$),
  ($c$CST-8$c$, $t$The approved and published personal data privacy policy, covering the types of data processed, purposes, and the other content the regulation requires; publication link and approval record.$t$),
  ($c$CST-9$c$, $t$Data location inventory showing customer personal data is processed inside the Kingdom; for any processing abroad, the written approval obtained from the regulator.$t$),
  ($c$CST-10$c$, $t$Retention periods per purpose aligned with the regulator's approved instructions; evidence they are applied in systems (configuration, deletion job logs).$t$),
  ($c$CST-11$c$, $t$Breach notification procedure using the regulator's approved mechanism; breach register; copies of notifications sent with timestamps showing they were immediate.$t$),
  ($c$CST-12$c$, $t$Explicit consent records per processing purpose; consent wording; consent-withdrawal channel and log; list of processing carried out under a legal exception with its basis.$t$),
  ($c$CST-13$c$, $t$Evidence the privacy policy is presented to customers before processing starts (sign-up flow screenshots, contract annex, acknowledgement records).$t$),
  ($c$CST-14$c$, $t$Customer access and correction procedure and channels; request log with response times; samples of corrections made.$t$),
  ($c$CST-15$c$, $t$Procedure for providing customers a copy of their personal data in electronic format per the regulator's instructions; sample export; request log.$t$),
  ($c$CST-16$c$, $t$The documented verification of whether a Privacy Impact Assessment is needed, completed before each launch of a product or service based on customer personal data or data sharing.$t$),
  ($c$CST-17$c$, $t$Where no assessment was needed: the verification results and justification submitted to the regulator, with the submission record.$t$),
  ($c$CST-18$c$, $t$Where an assessment was needed: the completed Privacy Impact Assessment and the record of its submission to the regulator before launch; mitigation actions tracked to closure.$t$),
  ($c$CST-19$c$, $t$Notifications sent to the regulator when launching products or services based on customer personal data or data sharing; launch register cross-referenced to notifications.$t$)
) AS v(req_code, evidence)
WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'CST')
  AND r.req_code = v.req_code
  AND coalesce(r.supporting_evidence_en, '') = '';

-- NDI_OPS_EXCELLENCE: 20 requirements
UPDATE bayanat.gov_compliance_requirements r
SET supporting_evidence    = CASE WHEN coalesce(r.supporting_evidence, '') = '' THEN v.evidence ELSE r.supporting_evidence END,
    supporting_evidence_en = v.evidence
FROM (VALUES
  ($c$DSI.OE.1$c$, $t$List of data fields the entity shares on the Government Service Bus for which it is not the authoritative source, with the true source of each and the plan to redirect consumers to that source.$t$),
  ($c$DSI.OE.2$c$, $t$Inventory of the entity's systems with their National Data Lake connection status; connection certificates or onboarding confirmations; plan and dates for the systems not yet connected.$t$),
  ($c$DSI.OE.3$c$, $t$Data sharing agreement register with request, approval and activation dates; calculated average processing time against the target; analysis of agreements that exceeded it.$t$),
  ($c$DQ.OE.1$c$, $t$Data quality reports for the data shared on the Government Service Bus (completeness, validity, timeliness, consistency); issue log with corrective actions and trend over time.$t$),
  ($c$DQ.OE.2$c$, $t$Data quality reports for the entity's data hosted in the National Data Lake; reconciliation against source systems; issue log with corrective actions and trend over time.$t$),
  ($c$RMD.OE.1$c$, $t$List of reference data tables published by the entity with owner, version and publication date; link or confirmation of publication on the national platform.$t$),
  ($c$RMD.OE.2$c$, $t$Register of new reference data tables with request and publication dates; calculated time to publish against the target.$t$),
  ($c$RMD.OE.3$c$, $t$Issue log for reference data tables with reported and resolved dates; calculated time to resolve against the target; root-cause notes for recurring issues.$t$),
  ($c$DO.OE.1$c$, $t$Response-time measurements for each of the entity's services on the Government Service Bus (average and percentile) against the agreed service level; monitoring dashboard export.$t$),
  ($c$DO.OE.2$c$, $t$Availability and responsiveness reports for the entity's services on the Government Service Bus; incident log with downtime and time to restore.$t$),
  ($c$DO.OE.3$c$, $t$Monitoring reports for automated integrations with the National Data Lake: job success rate, latency, failures and time to recover.$t$),
  ($c$MCM.OE.1$c$, $t$Inventory of the entity's systems with their National Data Catalog registration status; catalog export showing the registered systems and the coverage percentage.$t$),
  ($c$MCM.OE.2$c$, $t$Catalog export showing business fields defined with name, definition and owner in the National Data Catalog; coverage percentage against total fields.$t$),
  ($c$MCM.OE.3$c$, $t$Catalog export listing the performance indicators and standards the entity has defined in the National Data Catalog, each with definition, formula and owner.$t$),
  ($c$MCM.OE.4$c$, $t$Catalog export showing field-level standards (format, permitted values, classification) defined in the National Data Catalog; coverage percentage.$t$),
  ($c$MCM.OE.5$c$, $t$Review or validation report of the relationships recorded between data fields in the National Data Catalog, with the sampling method, errors found and corrections made.$t$),
  ($c$OD.OE.1$c$, $t$Open data set register with the committed update frequency and the actual last-update date of each; calculated delay per data set and overall.$t$),
  ($c$OD.OE.2$c$, $t$List of the entity's data sets published on the Open Data Portal with publication dates and links; count against the entity's open data plan.$t$),
  ($c$OD.OE.3$c$, $t$Issue log for open data sets (feedback, error reports) with counts per data set and period; trend over time.$t$),
  ($c$OD.OE.4$c$, $t$Issue log for open data sets with reported and resolved dates; calculated time to resolve against the target.$t$)
) AS v(req_code, evidence)
WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'NDI_OPS_EXCELLENCE')
  AND r.req_code = v.req_code
  AND coalesce(r.supporting_evidence_en, '') = '';

-- AI_ETHICS: 48 requirements
UPDATE bayanat.gov_compliance_requirements r
SET supporting_evidence    = CASE WHEN coalesce(r.supporting_evidence, '') = '' THEN v.evidence ELSE r.supporting_evidence END,
    supporting_evidence_en = v.evidence
FROM (VALUES
  ($c$AI-ETH-1$c$, $t$Human oversight design for the AI system (human-in-the-loop, on-the-loop or in-command) with the rationale for the level chosen given the use case and its risk.$t$),
  ($c$AI-ETH-2$c$, $t$Design measures against over-reliance: confidence indicators, mandatory human review points, override controls, user guidance on the system's limits.$t$),
  ($c$AI-ETH-3$c$, $t$Human oversight procedure with its KPIs (e.g. override rate, review turnaround) and a responsibility matrix naming the accountable parties.$t$),
  ($c$AI-ETH-4$c$, $t$Shutdown and intervention strategy: who may suspend or stop the system, under what conditions, and how; test record of the stop or fallback mechanism.$t$),
  ($c$AI-ETH-5$c$, $t$Legal review covering liability, and the documented requirements of the entity that owns the data (data sharing agreement, usage restrictions) reflected in the design.$t$),
  ($c$AI-ETH-6$c$, $t$KPI thresholds defined for the system with the action triggered when each is breached; governance or independent procedure for invoking the alternative or backup plan.$t$),
  ($c$AI-ETH-7$c$, $t$Training plan and attendance records on AI accountability and ethics for the teams building, operating and overseeing the system.$t$),
  ($c$AI-ETH-8$c$, $t$Mapping of the organisation's AI ethics governance structure to the mechanism proposed in the National AI Ethics Principles, with gaps and actions.$t$),
  ($c$AI-ETH-9$c$, $t$AI ethics governance document showing the internal or external audit mechanism; audit plan and, where held, audit reports.$t$),
  ($c$AI-ETH-10$c$, $t$Bias mitigation strategy and procedures covering input data and algorithm design; bias testing plan and results.$t$),
  ($c$AI-ETH-11$c$, $t$List of sensitive attributes relating to disadvantaged individuals or groups identified in the data; the justification for using each and the acceptable-use decision.$t$),
  ($c$AI-ETH-12$c$, $t$Defined fairness and integrity KPIs (e.g. performance parity across groups) with targets and measurement method.$t$),
  ($c$AI-ETH-13$c$, $t$Stakeholder engagement plan and records (workshops, consultations, feedback channels) for the development and use of the system.$t$),
  ($c$AI-ETH-14$c$, $t$Impact assessment of the system on human rights, fundamental values and cultural values, with findings and mitigations.$t$),
  ($c$AI-ETH-15$c$, $t$Disclosure of possible negative impacts on fundamental rights and cultural values, with the remedy or recovery mechanism available to affected people.$t$),
  ($c$AI-ETH-16$c$, $t$Design review showing the system does not deceive users or unjustifiably limit their choice: disclosure that they are interacting with AI, opt-out options, review of persuasive features.$t$),
  ($c$AI-ETH-17$c$, $t$Compliance mapping of the system to the applicable standards and policies (ISO standards, personal data protection law, data handling protocols) with evidence per requirement.$t$),
  ($c$AI-ETH-18$c$, $t$Personal data governance records for the system: record of processing, lawful basis, retention, and the procedures followed.$t$),
  ($c$AI-ETH-19$c$, $t$Verification record against the national data management standards and personal data protection requirements, with open gaps and actions.$t$),
  ($c$AI-ETH-20$c$, $t$Access control design and review for the system's data and models: role definitions, least-privilege evidence, latest access review.$t$),
  ($c$AI-ETH-21$c$, $t$Logging design covering inputs, outputs, decisions and model versions for audit, correction and compliance; log retention and sample logs.$t$),
  ($c$AI-ETH-22$c$, $t$The AI risk management strategy for the system, approved, with scope, roles and review cycle.$t$),
  ($c$AI-ETH-23$c$, $t$Risk register for the system with risk levels, KPIs, the risk assessment and documented mitigation procedures.$t$),
  ($c$AI-ETH-24$c$, $t$Harm assessment for users and third parties covering likelihood, expected severity and the audience affected, with mitigations.$t$),
  ($c$AI-ETH-25$c$, $t$Failure-mode analysis of the system not achieving its purpose (erroneous outcomes, inaccurate predictions, outages, reinforced bias) with fallback and recovery plans.$t$),
  ($c$AI-ETH-26$c$, $t$Assessment of risks to the environment, living beings, society and data subjects (e.g. energy use, social effects) with mitigations.$t$),
  ($c$AI-ETH-27$c$, $t$Assessment of how the system's operating model aligns with the organisation's vision, mission and code of conduct, with sign-off.$t$),
  ($c$AI-ETH-28$c$, $t$Explainability evaluation of the design: how data, algorithms, decisions and outputs can be explained to each stakeholder group; model and data documentation.$t$),
  ($c$AI-ETH-29$c$, $t$KPI thresholds defined for the system and the governance or independent procedure that applies when they are exceeded.$t$),
  ($c$AI-ETH-30$c$, $t$User experience review addressing confusion, confirmation bias and cognitive manipulation; usability test results and resulting design changes.$t$),
  ($c$AI-ETH-31$c$, $t$Record of whether a commercial trade-off against fairness was assumed, what it was, who approved it and how it was justified.$t$),
  ($c$AI-ETH-32$c$, $t$The privacy impact assessment mechanism (procedure and template) and the completed assessment for the system.$t$),
  ($c$AI-ETH-33$c$, $t$Review of the data management methodology against human values and the Kingdom's data regulatory frameworks, with findings and actions.$t$),
  ($c$AI-ETH-34$c$, $t$Mechanism for identifying privacy or protection issues during data collection and processing (checkpoints, reviews, reporting channel) and issues logged through it.$t$),
  ($c$AI-ETH-35$c$, $t$Data inventory for the system with the scope and classification level of each data set, reviewed and signed off.$t$),
  ($c$AI-ETH-36$c$, $t$Identifiability review of the data set: which personal data is present, how identifiable it is, and the de-identification applied.$t$),
  ($c$AI-ETH-37$c$, $t$Approach for training without personal or sensitive data or with the minimum necessary (anonymisation, synthetic data, minimisation), with evidence it was applied.$t$),
  ($c$AI-ETH-38$c$, $t$Consent mechanism for the use of personal data in the system, consent records, and the withdrawal process with a log of withdrawals actioned.$t$),
  ($c$AI-ETH-39$c$, $t$Security processes for the AI system and its data: threat assessment, controls for confidentiality, integrity and privacy, and results of security testing.$t$),
  ($c$AI-ETH-40$c$, $t$Data quality and provenance assessment for each data source used, following a defined process; source documentation and licences.$t$),
  ($c$AI-ETH-41$c$, $t$Feasibility assessment of post-training analysis and data testing, with the test plan adopted.$t$),
  ($c$AI-ETH-42$c$, $t$Review of the diversity and inclusiveness of the data set: representation analysis by relevant groups, gaps found and how they were addressed.$t$),
  ($c$AI-ETH-43$c$, $t$Mechanism and results measuring the integrity, quality and accuracy of data collection, sources and updates (data quality metrics, update logs).$t$),
  ($c$AI-ETH-44$c$, $t$Process for analysing sensitive attributes and their proxies in the features, with the analysis results and decisions taken.$t$),
  ($c$AI-ETH-45$c$, $t$Assessment of data classification, processing and access confirming the data was obtained correctly (lawful source, permitted use), with sign-off.$t$),
  ($c$AI-ETH-46$c$, $t$Validation of data and models against respect for human rights, values and cultural preferences in the Kingdom: test cases, reviewer sign-off, issues corrected.$t$),
  ($c$AI-ETH-47$c$, $t$Data classification record following the Authority's recommended levels; where other criteria were used, a statement of what they were and why.$t$),
  ($c$AI-ETH-48$c$, $t$Procedures and results measuring the quality, accuracy and relevance of the data sample, and its documentation (data sheet or data card).$t$)
) AS v(req_code, evidence)
WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'AI_ETHICS')
  AND r.req_code = v.req_code
  AND coalesce(r.supporting_evidence_en, '') = '';

COMMIT;
