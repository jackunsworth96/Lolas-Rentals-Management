-- ============================================================
-- CHAT SESSIONS — analytics logging for Lolo (AI chat bot)
-- ============================================================
-- One row per chat panel open. Updated via upsert as the
-- conversation progresses. Transcript is stored as JSONB for
-- future topic-classification analysis.

CREATE TABLE public.chat_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text        NOT NULL UNIQUE,   -- browser-generated UUID, one per chat open
  store_id          text        NOT NULL DEFAULT 'store-lolas',
  started_at        timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  page_origin       text,                          -- 'home' | 'browse' | 'basket' | 'confirmation' | 'transfers' | other
  message_count     int         NOT NULL DEFAULT 0,
  handoff_triggered boolean     NOT NULL DEFAULT false,
  device_type       text,                          -- 'mobile' | 'desktop'
  messages          jsonb,                         -- full transcript [{role, content}]
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_store_created
  ON public.chat_sessions (store_id, created_at DESC);

CREATE INDEX idx_chat_sessions_created_at
  ON public.chat_sessions (created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- Only the API service role may insert/upsert (fire-and-forget from chat.ts)
CREATE POLICY chat_sessions_service_insert
  ON public.chat_sessions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY chat_sessions_service_update
  ON public.chat_sessions
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated staff with can_view_dashboard may read
CREATE POLICY chat_sessions_staff_select
  ON public.chat_sessions
  FOR SELECT
  TO authenticated
  USING (public.has_permission('can_view_dashboard'));
