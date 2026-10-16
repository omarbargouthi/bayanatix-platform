-- 223: Follow-up to db/138 (product renamed from "Bayanatix" to "Bayanis").
-- * The demo CRM source's business application still read "Bayanatix CRM" (db/018).
-- * The Arabic name is «بيانس» (db/138 and the interface); Help Center drafts since
--   db/202 wrote «بيانيس». One name everywhere: those texts are corrected, keeping
--   their translation status.
-- Identifiers keep their old names on purpose (database, cookies, license issuer,
-- demo accounts). Safe to run more than once.

BEGIN;

UPDATE bayanat.data_sources SET business_app_name = 'Bayanis CRM' WHERE business_app_name = 'Bayanatix CRM';

UPDATE bayanat.translations SET translated_text = replace(translated_text, 'بيانيس', 'بيانس')
WHERE translated_text LIKE '%بيانيس%';

COMMIT;
