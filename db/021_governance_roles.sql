-- Add CUSTODIAN governance role
INSERT INTO bayanat.stakeholder_roles (role_code, role_name_text, description_text)
VALUES ('CUSTODIAN', 'Custodian', 'Responsible for data storage, security, and lifecycle management.')
ON CONFLICT (role_code) DO NOTHING;

-- Add default governance columns to crawl_config for cascade on crawl
ALTER TABLE bayanat.crawl_config
  ADD COLUMN IF NOT EXISTS default_owner_user_id      VARCHAR(100) REFERENCES bayanat.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_biz_steward_id     VARCHAR(100) REFERENCES bayanat.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_tech_steward_id    VARCHAR(100) REFERENCES bayanat.users(user_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_custodian_user_id  VARCHAR(100) REFERENCES bayanat.users(user_id) ON DELETE SET NULL;
