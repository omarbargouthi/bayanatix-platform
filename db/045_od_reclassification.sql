-- Migration 045: track re-classification reason and approval request on open dataset columns
ALTER TABLE bayanat.open_dataset_columns
  ADD COLUMN IF NOT EXISTS reclassification_reason TEXT,
  ADD COLUMN IF NOT EXISTS reclassification_request_id INT
    REFERENCES bayanat.asset_requests(request_id) ON DELETE SET NULL;
