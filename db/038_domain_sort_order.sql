-- Reorder governance_domains to match the required sequence:
-- 1=DG, 2=DCAT, 3=DQ, 4=CLS, 5=PDP, 6=DSH, 7=OD, 8=FOI,
-- 9=DOPS, 10=DCM, 11=DARC, 12=MDM, 13=BIA, 14=DV, 99=AIG (standalone)
UPDATE bayanat.governance_domains SET sort_order =
  CASE domain_code
    WHEN 'DG'   THEN 1
    WHEN 'DCAT' THEN 2
    WHEN 'DQ'   THEN 3
    WHEN 'CLS'  THEN 4
    WHEN 'PDP'  THEN 5
    WHEN 'DSH'  THEN 6
    WHEN 'OD'   THEN 7
    WHEN 'FOI'  THEN 8
    WHEN 'DOPS' THEN 9
    WHEN 'DCM'  THEN 10
    WHEN 'DARC' THEN 11
    WHEN 'MDM'  THEN 12
    WHEN 'BIA'  THEN 13
    WHEN 'DV'   THEN 14
    WHEN 'AIG'  THEN 99
    ELSE sort_order
  END;
