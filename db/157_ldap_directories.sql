-- 157: several LDAP directories.
-- An organisation often keeps different populations in different directories or
-- branches of one (employees vs contractors, a subsidiary's own Active Directory).
-- Each becomes a named directory with its own connection settings and its own on/off
-- switch; the sign-in screen lists the enabled ones and the user picks which to
-- authenticate against. auth_settings.ldap_enabled stays the master switch for LDAP
-- sign-in as a whole; its single-directory columns are no longer read.
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS bayanat.ldap_directories (
  directory_id            serial PRIMARY KEY,
  directory_name          varchar(100) NOT NULL UNIQUE,
  is_enabled              boolean NOT NULL DEFAULT true,
  sort_order              integer NOT NULL DEFAULT 0,
  url_text                varchar(255),
  use_starttls_indicator  boolean NOT NULL DEFAULT false,
  bind_dn_text            varchar(255),
  bind_credential_id      integer REFERENCES bayanat.llm_credentials(credential_id) ON DELETE SET NULL,
  base_dn_text            varchar(255),
  user_filter_text        varchar(255) DEFAULT '(mail={{username}})',
  email_attr_text         varchar(50)  DEFAULT 'mail',
  name_attr_text          varchar(50)  DEFAULT 'displayName',
  created_at              timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id      varchar(100)
);

-- The directory configured before this migration becomes the first entry.
INSERT INTO bayanat.ldap_directories
  (directory_name, is_enabled, url_text, use_starttls_indicator, bind_dn_text, bind_credential_id,
   base_dn_text, user_filter_text, email_attr_text, name_attr_text, updated_by_user_id)
SELECT 'Directory', true, s.ldap_url_text, s.ldap_use_starttls_indicator, s.ldap_bind_dn_text, s.ldap_bind_credential_id,
       s.ldap_base_dn_text, s.ldap_user_filter_text, s.ldap_email_attr_text, s.ldap_name_attr_text, s.updated_by_user_id
FROM bayanat.auth_settings s
WHERE s.id = 1 AND s.ldap_url_text IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM bayanat.ldap_directories);

-- Which directory an LDAP user signs in through (the same e-mail in two directories is
-- two different people as far as sign-in goes).
ALTER TABLE bayanat.users
  ADD COLUMN IF NOT EXISTS ldap_directory_id integer REFERENCES bayanat.ldap_directories(directory_id) ON DELETE SET NULL;

UPDATE bayanat.users u
SET ldap_directory_id = (SELECT min(directory_id) FROM bayanat.ldap_directories)
WHERE u.auth_provider_code = 'LDAP' AND u.ldap_directory_id IS NULL;

COMMIT;
