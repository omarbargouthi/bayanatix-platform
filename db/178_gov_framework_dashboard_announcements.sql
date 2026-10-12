-- 178: a Governance Framework document can be advertised on the Dashboard.
-- The Dashboard has an "Announcements" panel for major milestones, upcoming events,
-- training material and newly published policies or procedures. It picks documents up
-- on its own (those coming into effect soon, and those approved recently); this flag
-- lets the Data Management Office pin any other document there as well.
-- Safe to run more than once.

ALTER TABLE bayanat.gov_framework_docs
  ADD COLUMN IF NOT EXISTS announce_indicator boolean NOT NULL DEFAULT false;
