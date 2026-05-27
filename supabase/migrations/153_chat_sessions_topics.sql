-- ============================================================
-- 151: Chat session topic tags
--
-- Adds a topics text[] column to chat_sessions so that each
-- completed conversation can be tagged with one or more topic
-- categories (e.g. 'pricing', 'availability', 'cancellation').
-- Tags are written by the API at session-end using a lightweight
-- Anthropic classification call, enabling the dashboard to show
-- which topics customers ask about most frequently.
-- ============================================================

ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS topics text[] NOT NULL DEFAULT '{}';

-- GIN index for array containment queries (e.g. WHERE topics @> '{pricing}')
CREATE INDEX IF NOT EXISTS chat_sessions_topics_gin
  ON public.chat_sessions USING gin(topics);
