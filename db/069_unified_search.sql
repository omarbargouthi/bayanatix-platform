-- Unified Search Feature.
-- See "Bayanatix - Unified Search Feature Spec.md" for the full design.
-- v1 architecture is live federated queries across existing source tables (no
-- materialized search_index / CDC triggers — see session decision log). pg_trgm
-- is added for the fuzzy fallback (FR-3.3) and empty-state "closest term"
-- suggestions (FR-2.5); it's a self-contained extension, not a new table, so it
-- doesn't carry the trigger-sprawl risk the materialized-index approach would.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS bayanat.saved_searches (
  saved_search_id   serial PRIMARY KEY,
  user_id            varchar(100) NOT NULL,
  name_text          varchar(150) NOT NULL,
  query_string_text  text NOT NULL,   -- the /search?... query string verbatim (FR-2.6: all state in query string)
  created_at         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_saved_searches_user ON bayanat.saved_searches(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bayanat.search_analytics (
  search_log_id      serial PRIMARY KEY,
  user_id             varchar(100),
  query_text          text NOT NULL,
  types_json          jsonb,
  facets_json         jsonb,
  result_count        int4 NOT NULL DEFAULT 0,
  zero_result_indicator boolean NOT NULL DEFAULT false,
  clicked_hit_type    varchar(30),
  clicked_hit_id      int4,
  searched_at         timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON bayanat.search_analytics(query_text, searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_zero ON bayanat.search_analytics(zero_result_indicator) WHERE zero_result_indicator = true;
