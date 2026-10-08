#!/bin/bash
# Runs once, when the PostgreSQL volume is first created: the two databases and the
# read-only role the Reports custom-KPI sandbox logs in with (db/071).
set -e
psql -v ON_ERROR_STOP=1 -U postgres <<SQL
CREATE DATABASE bayanatix;
CREATE DATABASE crmdb;
CREATE ROLE bayanatix_kpi_readonly LOGIN PASSWORD '${KPI_SANDBOX_ROLE_PASSWORD}';
SQL
