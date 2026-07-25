-- Data Lineage demo pipeline — run against `crmdb` (the target of the scanned
-- connection "party", connection_id=1), NOT against bayanatix.
-- Mirrors the Figma reference scenario from
-- "Bayanatix - Data Lineage Requirements.md" §8:
--   ERP_INVOICE_RAW, ERP_FX_RATE_RAW -> sp_load_stg_invoices -> STG_INVOICES
--   -> sp_load_ar_invoices -> AR_INVOICES -> VW_DSO_TREND (view) + sp_load_ar_aging -> AR_AGING
-- Idempotent: safe to re-run.

CREATE SCHEMA IF NOT EXISTS ar;

CREATE TABLE IF NOT EXISTS ar.erp_invoice_raw (
  invoice_id    bigint PRIMARY KEY,
  customer_id   bigint,
  gross_amt     numeric(18,2),
  currency_code varchar(3),
  invoice_date  date
);

CREATE TABLE IF NOT EXISTS ar.erp_fx_rate_raw (
  currency_code varchar(3) PRIMARY KEY,
  fx_rate       numeric(10,6),
  rate_date     date
);

CREATE TABLE IF NOT EXISTS ar.stg_invoices (
  invoice_id    bigint PRIMARY KEY,
  customer_id   bigint,
  net_amount    numeric(18,2),
  invoice_date  date
);

CREATE TABLE IF NOT EXISTS ar.ar_invoices (
  invoice_id     bigint PRIMARY KEY,
  customer_id    bigint,
  invoice_amount numeric(18,2),
  invoice_date   date,
  due_date       date
);

CREATE TABLE IF NOT EXISTS ar.ar_aging (
  invoice_id   bigint PRIMARY KEY,
  open_balance numeric(18,2),
  days_overdue int
);

CREATE OR REPLACE PROCEDURE ar.sp_load_stg_invoices()
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM ar.stg_invoices;
  INSERT INTO ar.stg_invoices (invoice_id, customer_id, net_amount, invoice_date)
  SELECT r.invoice_id, r.customer_id, r.gross_amt * COALESCE(f.fx_rate, 1), r.invoice_date
  FROM ar.erp_invoice_raw r
  LEFT JOIN ar.erp_fx_rate_raw f ON f.currency_code = r.currency_code;
END;
$$;

CREATE OR REPLACE PROCEDURE ar.sp_load_ar_invoices()
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM ar.ar_invoices;
  INSERT INTO ar.ar_invoices (invoice_id, customer_id, invoice_amount, invoice_date, due_date)
  SELECT s.invoice_id, s.customer_id, s.net_amount, s.invoice_date, s.invoice_date + INTERVAL '30 day'
  FROM ar.stg_invoices s;
END;
$$;

CREATE OR REPLACE PROCEDURE ar.sp_load_ar_aging()
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM ar.ar_aging;
  INSERT INTO ar.ar_aging (invoice_id, open_balance, days_overdue)
  SELECT invoice_id, invoice_amount, GREATEST(0, CURRENT_DATE - due_date)
  FROM ar.ar_invoices;
END;
$$;

CREATE OR REPLACE VIEW ar.vw_dso_trend AS
SELECT date_trunc('month', invoice_date) AS month, AVG(invoice_amount) AS dso_value
FROM ar.ar_invoices
GROUP BY date_trunc('month', invoice_date);

-- Sample data so the pipeline is runnable / rows aren't all empty
INSERT INTO ar.erp_invoice_raw (invoice_id, customer_id, gross_amt, currency_code, invoice_date)
VALUES
  (1001, 501, 1200.00, 'USD', '2026-05-15'),
  (1002, 502, 3400.50, 'SAR', '2026-06-02'),
  (1003, 501,  980.00, 'USD', '2026-06-20')
ON CONFLICT (invoice_id) DO NOTHING;

INSERT INTO ar.erp_fx_rate_raw (currency_code, fx_rate, rate_date)
VALUES ('USD', 1.000000, '2026-06-01'), ('SAR', 0.266600, '2026-06-01')
ON CONFLICT (currency_code) DO NOTHING;

CALL ar.sp_load_stg_invoices();
CALL ar.sp_load_ar_invoices();
CALL ar.sp_load_ar_aging();
