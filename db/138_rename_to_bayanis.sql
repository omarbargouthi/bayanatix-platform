-- Product renamed from "Bayanatix" to "Bayanis". Only user-facing text changes
-- here; the database name, the bayanat schema, cookie names and the license
-- issuer keep their old identifiers on purpose (renaming those would break
-- existing sessions, installs and issued licenses).

UPDATE bayanat.llm_provider_profiles
SET profile_name_text = replace(profile_name_text, 'Bayanatix Local', 'Bayanis Local')
WHERE profile_name_text LIKE 'Bayanatix Local%';

-- Keep the product name out of machine translation.
INSERT INTO bayanat.translation_protected_terms (term_text) VALUES ('Bayanis')
ON CONFLICT DO NOTHING;

-- UI strings that carry the product name: update the base text so a later run of
-- scripts/seed-translation-keys.mts sees them as unchanged, and the Arabic text.
UPDATE bayanat.translation_keys SET base_text = 'Bayanis Assistant' WHERE key_code = 'chat.headerTitle';
UPDATE bayanat.translation_keys SET base_text = 'Bayanis Crawler'   WHERE key_code = 'auditLog.systemActor';

UPDATE bayanat.translations t SET translated_text = 'مساعد بيانس', status_code = 'VERIFIED', translated_at = now(), verified_at = now()
FROM bayanat.translation_keys k
WHERE k.key_id = t.key_id AND k.key_code = 'chat.headerTitle' AND t.language_code = 'ar';

UPDATE bayanat.translations t SET translated_text = 'زاحف بيانس', status_code = 'VERIFIED', translated_at = now(), verified_at = now()
FROM bayanat.translation_keys k
WHERE k.key_id = t.key_id AND k.key_code = 'auditLog.systemActor' AND t.language_code = 'ar';
