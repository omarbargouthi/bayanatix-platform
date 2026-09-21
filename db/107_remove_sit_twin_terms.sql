-- Removes the 19 business-glossary TERM rows db/104 created purely to double as
-- SIT catalog entries (National ID, IBAN, DoB, ...), now that db/106 split SIT
-- into its own standalone bayanat.sit_types catalog. These terms were always
-- redundant duplicates of the catalog rather than genuine business vocabulary —
-- they dominated the "Glossary Term" picker in bulk Excel exports and the
-- in-app Business Term pickers, reading as "a list of SITs" rather than terms.
-- Explicitly excludes glossary_id 15 ("National ID", pre-existing Finance term)
-- and 16 ("Customer Email") — those are genuine organic business terms that
-- happen to already be associated with the same-named SIT types; not touched.
--
-- Net effect on the SIT catalog: 17 of the 19 affected SIT types lose their only
-- associated business term and become unusable for automatic column
-- classification until re-associated with a real term (via the SitTypePicker on
-- that term's edit page) — "Email Address" and "National ID" keep working
-- because 16 and 15 remain associated with them independently.

-- ── 1. Clear the one live SIT classification pointing at a term being removed ──
-- (person.date_of_birth was classified DoB, glossary_id=46, during feature
-- verification — the classification can't be preserved once its target term is
-- gone, so fully reset the suggestion/classification state rather than leaving
-- a stale classification_code with no backing term.)

UPDATE bayanat.data_attributes SET
  suggested_sit_glossary_id = NULL,
  sit_suggestion_confidence = NULL,
  sit_suggestion_rationale_json = NULL,
  sit_suggestion_status_code = 'NONE',
  sit_classified_by_user_id = NULL,
  sit_classified_at_timestamp = NULL,
  classification_code = NULL
WHERE suggested_sit_glossary_id IN (
  45,36,52,47,46,48,44,49,38,39,51,43,42,40,34,35,37,50,41
);

-- ── 2. Delete the 19 twin terms ────────────────────────────────────────────────
-- asset_business_terms, business_term_sit_types, and glossary_aliases rows
-- referencing them cascade automatically (see FKs on business_glossaries).

DELETE FROM bayanat.business_glossaries
WHERE glossary_id IN (45,36,52,47,46,48,44,49,38,39,51,43,42,40,34,35,37,50,41)
  AND term_type = 'TERM';

-- ── 3. Delete the now-empty SIT-only subdomains, then the domain ──────────────
-- Self-referential FK is NOT ACTION, so children (subdomains) must go before
-- their parent (the domain) — verified empty of any other content first.

DELETE FROM bayanat.business_glossaries
WHERE glossary_id IN (29,30,31,32,33) AND term_type = 'SUBDOMAIN'
  AND NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries c WHERE c.parent_glossary_id = business_glossaries.glossary_id);

DELETE FROM bayanat.business_glossaries
WHERE glossary_id = 28 AND term_name_text = 'IT & Technical Data' AND term_type = 'DOMAIN'
  AND NOT EXISTS (SELECT 1 FROM bayanat.business_glossaries c WHERE c.parent_glossary_id = business_glossaries.glossary_id);
