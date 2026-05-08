-- =====================================================
-- Bayanatix platform — additive migration
-- Adds: users table, governance_domains table, columns
--       used by the UI that aren't in the original schema.
-- Safe to run on top of the existing bayanat.* schema.
-- =====================================================

create schema if not exists bayanat;

-- ---------- Users (auth) ----------
create table if not exists bayanat.users (
    user_id        varchar(64)  primary key,
    email          varchar(255) not null unique,
    full_name      varchar(150) not null,
    role           varchar(20)  not null default 'VIEWER',  -- ADMIN | STEWARD | OFFICER | VIEWER
    password_hash  varchar(255) not null,
    is_active      boolean      not null default true,
    created_at     timestamp    not null default current_timestamp,
    last_login_at  timestamp    null
);

create index if not exists ix_users_email on bayanat.users (lower(email));

-- ---------- Governance domains (NDMO) ----------
create table if not exists bayanat.governance_domains (
    domain_code         varchar(40)  primary key,
    domain_name         varchar(120) not null,
    domain_description  text         not null,
    compliance_pct      int          not null default 0 check (compliance_pct between 0 and 100),
    maturity_level      int          not null default 0 check (maturity_level between 0 and 5),
    maturity_label      varchar(8)   not null default 'L1',
    specs_tracked       int          not null default 0,
    controls_passing    int          not null default 0,
    open_findings       int          not null default 0,
    alert_count         int          not null default 0,
    sort_order          int          not null default 0
);

-- ---------- UI-facing extensions on existing tables ----------
-- These are additive; if any column already exists, the alter is a no-op.
do $$
begin
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_entities' and column_name='row_count_estimate') then
        alter table bayanat.data_entities add column row_count_estimate bigint null;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_entities' and column_name='trust_score') then
        alter table bayanat.data_entities add column trust_score numeric(5,2) null;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_attributes' and column_name='classification_code') then
        alter table bayanat.data_attributes add column classification_code varchar(20) null;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_attributes' and column_name='glossary_term_text') then
        alter table bayanat.data_attributes add column glossary_term_text varchar(255) null;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_attributes' and column_name='quality_score') then
        alter table bayanat.data_attributes add column quality_score numeric(5,2) null;
    end if;
    if not exists (select 1 from information_schema.columns
                   where table_schema='bayanat' and table_name='data_attributes' and column_name='null_percentage') then
        alter table bayanat.data_attributes add column null_percentage numeric(5,2) null;
    end if;
end$$;
