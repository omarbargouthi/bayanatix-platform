-- 177: the "Maturity by Domain" section of the Governance page is gone — the maturity
-- of each domain is shown on the domain cards of the regulation itself (Compliance page,
-- NDI / NAII) — so the texts db/176 added for that section are removed. Their
-- translations go with them (ON DELETE CASCADE).
-- Safe to run more than once.

DELETE FROM bayanat.translation_keys WHERE key_code LIKE 'governance.maturity.%';
