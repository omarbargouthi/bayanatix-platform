-- Renames the "Customer & Marketing" domain to "Customer" per user request.
-- Note: a business TERM named plain "Customer" already exists (glossary_id=7,
-- under the Finance domain, describing an individual/company customer master
-- record) — distinct row, different term_type, no technical conflict, but the
-- domain and that term now share a name. Left as-is since renaming/moving the
-- Finance term wasn't requested; flagged here for whoever reviews this "vanilla"
-- configuration next.

UPDATE bayanat.business_glossaries
SET term_name_text = 'Customer'
WHERE glossary_id = 3 AND term_name_text = 'Customer & Marketing' AND parent_glossary_id IS NULL;
