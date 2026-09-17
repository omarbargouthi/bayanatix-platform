-- Migration 101: Profile page settings
-- Adds per-user avatar color preset and notification-type opt-outs, backing
-- the redesigned Profile page (avatar selection, notification preferences).
-- Password reset uses the existing users.password_hash column (no schema change).

ALTER TABLE bayanat.users ADD COLUMN IF NOT EXISTS avatar_color_code VARCHAR(20);
ALTER TABLE bayanat.users ADD COLUMN IF NOT EXISTS disabled_notification_types TEXT[] NOT NULL DEFAULT '{}';
