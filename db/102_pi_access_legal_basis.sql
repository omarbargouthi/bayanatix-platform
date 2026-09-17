-- Migration 102: Legal basis for PI Clear-Text Access requests
--
-- PDPL requires a documented legal basis for processing personal data, not
-- just a business "purpose of use" — the same distinction already modeled
-- for Data Sharing Agreements (bayanat.dsas.purpose_text / .legal_basis_text,
-- db/051_data_sharing.sql). PI_CLEAR_TEXT_ACCESS requests go through the
-- generic asset_requests table, which only has one free-text description
-- field (used as "purpose"), so legal basis is captured in a small side
-- table instead of overloading that field or widening the generic table.

CREATE TABLE IF NOT EXISTS bayanat.pi_access_requests (
  request_id       INT PRIMARY KEY REFERENCES bayanat.asset_requests(request_id) ON DELETE CASCADE,
  legal_basis_text TEXT NOT NULL
);

ALTER TABLE bayanat.pi_access_grants ADD COLUMN IF NOT EXISTS legal_basis_text TEXT;
