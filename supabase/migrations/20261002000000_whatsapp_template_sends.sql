CREATE TABLE public.whatsapp_template_sends (
  operation_key text PRIMARY KEY,
  phone_number_id text NOT NULL,
  recipient text NOT NULL,
  body text NOT NULL,
  template_name text NOT NULL,
  template_language text NOT NULL,
  external_message_id text UNIQUE,
  sent_at timestamptz,
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX whatsapp_template_sends_unreported_idx
  ON public.whatsapp_template_sends (sent_at)
  WHERE external_message_id IS NOT NULL AND reported_at IS NULL;

ALTER TABLE public.whatsapp_template_sends ENABLE ROW LEVEL SECURITY;
