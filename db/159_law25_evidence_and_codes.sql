-- 159: Québec Law 25 — supporting evidence for every requirement, and unambiguous codes.
-- (1) Each requirement gets the evidence an assessor would expect to see, so two
--     requirements under the same section can be told apart and acted on.
-- (2) db/158 numbered "the n-th requirement of section 8" as LAW25.8.n, which is also how
--     section 8.n itself was written — so LAW25.8.1 and LAW25.8.2 each ended up holding
--     two unrelated requirements. Codes now carry an "s" and a dash:
--     LAW25.s8-1 (section 8, first requirement) vs LAW25.s8.1 (section 8.1).
-- Requirements keep their ids, so assessments already recorded stay attached.
-- Safe to run more than once.

BEGIN;

UPDATE bayanat.gov_compliance_requirements r
SET standard = v.std, standard_code = v.std, req_code = v.std || '-L0-' || v.sort_order,
    supporting_evidence = v.evidence, supporting_evidence_en = v.evidence
FROM (VALUES
  (0, $t$LAW25.s3.1-1$t$, $t$Record naming the person in charge of the protection of personal information; the written delegation where the function is not held by the person with the highest authority (e.g. signed delegation letter or board resolution).$t$),
  (1, $t$LAW25.s3.1-2$t$, $t$Screenshot or link of the website page showing the title and contact information of the person in charge; date it was published.$t$),
  (2, $t$LAW25.s3.2-1$t$, $t$Approved governance policies and practices for personal information (version, approval date, approver); note explaining how they are proportionate to the organization's activities.$t$),
  (3, $t$LAW25.s3.2-2$t$, $t$The sections of the policies covering retention and destruction, the roles and responsibilities of personnel across the information life cycle, and the complaint-handling process.$t$),
  (4, $t$LAW25.s3.2-3$t$, $t$Link to the published summary of the policies and practices on the website; evidence it is written in plain language (e.g. review or readability sign-off).$t$),
  (5, $t$LAW25.s20$t$, $t$Access-control matrix or role definitions showing who can access personal information and why; latest access review with removals actioned.$t$),
  (6, $t$LAW25.s3.3-1$t$, $t$PIA procedure and template; register of projects with the PIA completed for each information system or electronic service delivery project involving personal information.$t$),
  (7, $t$LAW25.s3.3-2$t$, $t$PIA records showing the person in charge was consulted at project start (dates, minutes); the proportionality rationale in each assessment.$t$),
  (8, $t$LAW25.s3.3-3$t$, $t$Design or requirements document showing the system can export a person's computerized information in a structured, commonly used format; a sample export.$t$),
  (9, $t$LAW25.s3.4$t$, $t$Project records listing the protection measures suggested by the person in charge and how each was addressed (accepted, adapted, or declined with reason).$t$),
  (10, $t$LAW25.s3.5-1$t$, $t$Incident response procedure; for past incidents, the record of containment and corrective measures taken to reduce injury and prevent recurrence.$t$),
  (11, $t$LAW25.s3.5-2$t$, $t$Copies of notifications sent to the Commission d'accès à l'information and to affected persons, with dates showing they were prompt; the decision record where no notification was made.$t$),
  (12, $t$LAW25.s3.6$t$, $t$Incident definition in the policy covering unauthorized access, use and communication, loss, and any other breach; staff guidance on what to report.$t$),
  (13, $t$LAW25.s3.7$t$, $t$Completed serious-injury risk assessments for incidents, showing sensitivity, anticipated consequences and likelihood of injurious use, and the consultation of the person in charge.$t$),
  (14, $t$LAW25.s3.8$t$, $t$The confidentiality incident register with all incidents (including those not notified), kept in the form required; evidence it can be produced to the CAI on request.$t$),
  (15, $t$LAW25.s4$t$, $t$Record of processing or data inventory stating, for each collection, the serious and legitimate reason and the purposes determined before collection.$t$),
  (16, $t$LAW25.s5$t$, $t$Data-minimization review of forms and systems showing each data element collected is necessary for the stated purposes; fields removed as a result.$t$),
  (17, $t$LAW25.s6$t$, $t$Inventory of personal information obtained from third parties, with the consent or legal exception relied on for each source.$t$),
  (18, $t$LAW25.s8-1$t$, $t$Collection notices (forms, screens, call scripts) showing the purposes, the means of collection, the rights of access and rectification, and the right to withdraw consent.$t$),
  (19, $t$LAW25.s8-2$t$, $t$Collection notices naming the third parties or categories of third parties who receive the information, any third party it is collected for, and the possibility of communication outside Québec.$t$),
  (20, $t$LAW25.s8-3$t$, $t$Procedure and response template for requests about what was collected, who has access, how long it is kept and how to reach the person in charge; sample responses.$t$),
  (21, $t$LAW25.s8.1$t$, $t$Inventory of identification, location and profiling technologies in use; the prior notice shown to users; proof these functions are off until the person activates them.$t$),
  (22, $t$LAW25.s8.2$t$, $t$The published confidentiality policy for information collected by technological means; version history and the notices given when it changed.$t$),
  (23, $t$LAW25.s9.1$t$, $t$Default privacy settings of each public-facing product or service, shown as shipped (screenshots or configuration), demonstrating the most protective option is the default.$t$),
  (24, $t$LAW25.s14-1$t$, $t$Consent wording for each purpose; review confirming it is clear, free, informed, specific and in plain language; consent records per purpose.$t$),
  (25, $t$LAW25.s14-2$t$, $t$Written consent forms showing the request is separate from other terms; record of assistance offered or given to people who asked for help understanding it.$t$),
  (26, $t$LAW25.s14-3$t$, $t$Rule defining how long each consent remains valid and what happens at expiry (renewal or end of processing); evidence it is applied in systems.$t$),
  (27, $t$LAW25.s12-1$t$, $t$List of sensitive personal information held; the express consent captured before any secondary use or communication of it; consent records.$t$),
  (28, $t$LAW25.s4.1$t$, $t$Age-verification and parental-consent procedure for minors under 14; consent records from the holder of parental authority or tutor.$t$),
  (29, $t$LAW25.s8-4$t$, $t$Consent-withdrawal procedure and channel; log of withdrawals with the date processing stopped in each system.$t$),
  (30, $t$LAW25.s12-2$t$, $t$Record mapping each use of personal information to its original purpose, or to the consent or legal exception that permits a different use.$t$),
  (31, $t$LAW25.s12-3$t$, $t$De-identification procedure for study, research and statistics; re-identification risk assessment and the controls applied.$t$),
  (32, $t$LAW25.s11$t$, $t$Data-quality controls on information used for decisions (validation rules, update procedures, quality checks); results of recent accuracy reviews.$t$),
  (33, $t$LAW25.s12.1-1$t$, $t$Inventory of decisions made exclusively by automated processing; the notice given to the person at or before the decision is communicated.$t$),
  (34, $t$LAW25.s12.1-2$t$, $t$Procedure and response template explaining the information used, the reasons, and the principal factors and parameters of an automated decision; sample responses.$t$),
  (35, $t$LAW25.s12.1-3$t$, $t$Human-review procedure for automated decisions, naming the staff able to review them; log of observations received and review outcomes.$t$),
  (36, $t$LAW25.s13$t$, $t$Register of communications to third parties with the consent or legal authorization relied on for each.$t$),
  (37, $t$LAW25.s17-1$t$, $t$PIAs completed before each communication or outsourcing outside Québec; inventory of cross-border transfers and service providers.$t$),
  (38, $t$LAW25.s17-2$t$, $t$The transfer PIA content: sensitivity, purposes, protection measures including contractual ones, and the analysis of the destination State's legal framework.$t$),
  (39, $t$LAW25.s17-3$t$, $t$The conclusion of each transfer PIA on adequate protection; the written agreement that reflects its findings and mitigation measures.$t$),
  (40, $t$LAW25.s18.3-1$t$, $t$Written contracts or mandates with service providers containing the confidentiality measures, use limitation and no-retention-after-expiry clauses.$t$),
  (41, $t$LAW25.s18.3-2$t$, $t$Contract clauses requiring immediate notice of any confidentiality violation and granting verification rights; records of verifications carried out.$t$),
  (42, $t$LAW25.s18.4$t$, $t$Agreements for commercial transactions (due diligence, mergers, acquisitions) with the use-limitation, confidentiality and destruction clauses.$t$),
  (43, $t$LAW25.s21$t$, $t$PIA and written agreement for each communication made for study, research or statistics without consent; the notice sent to the CAI where required.$t$),
  (44, $t$LAW25.s23-1$t$, $t$Retention schedule; destruction logs or certificates showing information is destroyed once its purposes are achieved, subject to legal retention periods.$t$),
  (45, $t$LAW25.s23-2$t$, $t$Anonymization procedure, the serious and legitimate purpose documented for each use, and the re-identification risk analysis showing the result is irreversible.$t$),
  (46, $t$LAW25.s3.2-4$t$, $t$Retention periods and destruction methods per category of personal information; proof they are implemented in each system (configuration, job logs).$t$),
  (47, $t$LAW25.s10-1$t$, $t$Information security policy and the controls protecting personal information (access control, encryption, logging, backup, secure disposal); risk assessment justifying them.$t$),
  (48, $t$LAW25.s10-2$t$, $t$Records of periodic security reviews triggered by changes in sensitivity, volume or medium; actions taken as a result.$t$),
  (49, $t$LAW25.s27-1$t$, $t$Access-request procedure; request log; sample responses confirming whether information is held and providing a copy.$t$),
  (50, $t$LAW25.s27-2$t$, $t$Portability procedure; a sample export in a structured, commonly used format; log of portability requests, including transfers to an authorized third party.$t$),
  (51, $t$LAW25.s28$t$, $t$Rectification and deletion procedure; request log; samples showing corrections made and the notice given to the applicant and to recipients of the information.$t$),
  (52, $t$LAW25.s28.1$t$, $t$Procedure for requests to cease dissemination or to de-index or re-index a hyperlink; decision records applying the legal criteria.$t$),
  (53, $t$LAW25.s32$t$, $t$Request log with received and answered dates demonstrating the 30-day time limit is met; escalation for requests near the limit.$t$),
  (54, $t$LAW25.s34$t$, $t$Refusal letter template with reasons, the provision relied on, available remedies and time limits; samples of refusals issued.$t$),
  (55, $t$LAW25.s33$t$, $t$Fee policy showing access is free and stating the reasonable charge for transcription, reproduction or transmission; the advance notice of the charge given to applicants.$t$),
  (56, $t$LAW25.s30$t$, $t$Identity and authority verification procedure for applicants, representatives, heirs and holders of parental authority; samples of verification records.$t$),
  (57, $t$LAW25.sIT-44-1$t$, $t$Express consent captured before any biometric identity verification; the non-biometric alternative offered to people who decline.$t$),
  (58, $t$LAW25.sIT-44-2$t$, $t$Declaration made to the Commission d'accès à l'information before biometric characteristics or measurements are used to verify identity.$t$),
  (59, $t$LAW25.sIT-45$t$, $t$Declaration of each biometric database to the CAI, dated at least 60 days before it was put into service; inventory of biometric databases.$t$)
) AS v(sort_order, std, evidence)
WHERE r.framework_id = (SELECT framework_id FROM bayanat.gov_compliance_frameworks WHERE code = 'QC_LAW25')
  AND r.sort_order = v.sort_order;

COMMIT;
