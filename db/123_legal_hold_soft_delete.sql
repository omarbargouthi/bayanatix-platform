-- Migration 123: Soft-delete for legal holds, visible only to ADMIN /
-- Data Privacy Officer
-- =====================================================================
-- Legal holds previously had no delete path at all. Adds a soft-delete
-- (is_deleted + deleted_at + deleted_by_user_id) rather than a hard DELETE —
-- a released/deleted hold's history (who placed it, its conditions, its
-- driving tables) stays available for audit rather than disappearing. Once
-- deleted, a hold is hidden from the normal Legal Holds list for everyone
-- except ADMIN and the "Data Privacy Officer" role (bayanat.roles /
-- role_assignments — the same granular role already used for the PI
-- Clear-Text Access workflow), and can be restored by either.

ALTER TABLE bayanat.legal_holds
  ADD COLUMN IF NOT EXISTS is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at         TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id TEXT REFERENCES bayanat.users(user_id);
