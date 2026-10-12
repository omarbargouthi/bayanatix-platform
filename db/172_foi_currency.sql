-- FOI currency as configuration.
-- The currency FOI fees are assessed, quoted and paid in was hardcoded as SAR.
-- It is now a system_config value (Administration → Configuration → FOI Settings).
-- Each quote and payment also records the currency it was issued in, so changing
-- the setting later does not relabel amounts that were already quoted or received.

INSERT INTO bayanat.system_config (key, value) VALUES
  ('foi_currency_code', 'SAR')
ON CONFLICT (key) DO NOTHING;

-- Existing rows were all issued in SAR; the column default backfills them.
ALTER TABLE bayanat.foi_quotes
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'SAR';

ALTER TABLE bayanat.foi_payments
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(3) NOT NULL DEFAULT 'SAR';
