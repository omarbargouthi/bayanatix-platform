-- DB-backed UI translation overrides.
-- Keys are dot-notation paths matching I18nStrings (e.g. "nav.dashboard", "common.save").
-- Admins manage these via /admin/configuration → UI Translations.
-- Values here override the static defaults in lib/i18n/en.ts and ar.ts.

CREATE TABLE IF NOT EXISTS bayanat.ui_translations (
  key   TEXT NOT NULL,
  lang  TEXT NOT NULL CHECK (lang IN ('en', 'ar')),
  value TEXT NOT NULL,
  PRIMARY KEY (key, lang)
);
