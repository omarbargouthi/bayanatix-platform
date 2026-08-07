-- AI Chat Assistant ("Ask Bayanatix") — foundation pass. Spec: DG Files\Bayanatix - AI Chat Assistant Feature Spec.md §4.

CREATE TABLE IF NOT EXISTS bayanat.chat_conversations (
  conversation_id     serial4 PRIMARY KEY,
  user_id              varchar(100) NOT NULL,
  title_text           varchar(255),
  context_asset_type   varchar(50),
  context_asset_id     int4,
  created_at            timestamp NOT NULL DEFAULT now(),
  last_message_at       timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON bayanat.chat_conversations(user_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS bayanat.chat_messages (
  message_id            serial4 PRIMARY KEY,
  conversation_id        int4 NOT NULL REFERENCES bayanat.chat_conversations(conversation_id) ON DELETE CASCADE,
  role_code               varchar(10) NOT NULL,
  content_text             text NOT NULL,
  tool_trace_json           jsonb,
  sources_json              jsonb,
  model_ref_text            varchar(100),
  token_count_int           int4,
  feedback_code             varchar(10),
  feedback_comment_text     text,
  created_at                timestamp NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE bayanat.chat_messages ADD CONSTRAINT chat_messages_role_check CHECK (role_code IN ('USER','ASSISTANT'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE bayanat.chat_messages ADD CONSTRAINT chat_messages_feedback_check CHECK (feedback_code IS NULL OR feedback_code IN ('UP','DOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON bayanat.chat_messages(conversation_id, created_at);

-- Widen the LLM Provider Configuration capability-route CHECK to allow a CHAT route
-- alongside the existing enrichment capabilities (DESCRIBE/REPHRASE/DQ_SEMANTIC).
ALTER TABLE bayanat.llm_capability_routes DROP CONSTRAINT IF EXISTS llm_capability_routes_code_check;
ALTER TABLE bayanat.llm_capability_routes
  ADD CONSTRAINT llm_capability_routes_code_check
  CHECK (capability_code IN ('DESCRIBE','REPHRASE','DQ_SEMANTIC','CHAT'));
