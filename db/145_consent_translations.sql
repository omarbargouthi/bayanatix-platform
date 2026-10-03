-- Consent notice follows the standard translation architecture: English is the base
-- text on platform_policy_settings, every other language lives in translation_keys /
-- translations (Configuration > Languages & Translations), like other admin-defined
-- text. The Arabic default from db/144 moves there as VERIFIED, and the separate
-- Arabic columns go away.

INSERT INTO bayanat.translation_categories (category_code, category_name_text, domain_code)
VALUES ('PLATFORM_CONSENT', 'User Consent Notice', 'LIST')
ON CONFLICT (category_code) DO NOTHING;

INSERT INTO bayanat.translation_keys (category_code, key_code, base_text, base_language_code)
SELECT 'PLATFORM_CONSENT', 'platform_consent.1.' || k.suffix, k.base, 'en'
FROM bayanat.platform_policy_settings s,
     LATERAL (VALUES ('title', s.consent_title_en), ('text', s.consent_text_en)) AS k(suffix, base)
WHERE s.settings_id = 1 AND btrim(k.base) <> ''
ON CONFLICT (key_code) DO NOTHING;

INSERT INTO bayanat.translations (key_id, language_code, translated_text, status_code, translated_at, verified_at)
SELECT tk.key_id, 'ar', k.ar, 'VERIFIED', now(), now()
FROM bayanat.platform_policy_settings s,
     LATERAL (VALUES ('title', s.consent_title_ar), ('text', s.consent_text_ar)) AS k(suffix, ar)
JOIN bayanat.translation_keys tk ON tk.key_code = 'platform_consent.1.' || k.suffix
WHERE s.settings_id = 1 AND btrim(coalesce(k.ar, '')) <> ''
ON CONFLICT (key_id, language_code) DO NOTHING;

ALTER TABLE bayanat.platform_policy_settings
  DROP COLUMN IF EXISTS consent_title_ar,
  DROP COLUMN IF EXISTS consent_text_ar;
