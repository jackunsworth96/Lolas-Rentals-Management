export interface RespondIoChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RespondIoChatRequest {
  messages: RespondIoChatMessage[];
  session_id?: string;
  page_origin?: string;
  device_type?: 'mobile' | 'desktop';
}

interface RespondIoChatResult {
  text: string;
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function extractFromMessageArray(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  for (let i = value.length - 1; i >= 0; i -= 1) {
    const candidate = value[i];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (candidate && typeof candidate === 'object') {
      const rec = candidate as Record<string, unknown>;
      const text = getString(rec.text) ?? getString(rec.content) ?? getString(rec.message);
      if (text) return text;
    }
  }
  return null;
}

/**
 * Respond.io webhook/workflow responses vary by builder setup.
 * We try common fields first, then a shallow nested scan for text-bearing keys.
 */
function extractRespondIoText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;

  const direct =
    getString(root.text) ??
    getString(root.reply) ??
    getString(root.response) ??
    getString(root.message) ??
    getString(root.output);

  if (direct) return direct;

  const messageText = extractFromMessageArray(root.messages);
  if (messageText) return messageText;

  const candidateKeys = ['data', 'result', 'payload', 'body'];
  for (const key of candidateKeys) {
    const child = root[key];
    if (!child || typeof child !== 'object') continue;
    const nested = child as Record<string, unknown>;
    const nestedText =
      getString(nested.text) ??
      getString(nested.reply) ??
      getString(nested.response) ??
      getString(nested.message) ??
      getString(nested.output) ??
      extractFromMessageArray(nested.messages);
    if (nestedText) return nestedText;
  }

  return null;
}

export async function sendRespondIoChat(
  input: RespondIoChatRequest,
): Promise<RespondIoChatResult> {
  const endpoint = process.env.RESPOND_IO_CHAT_WEBHOOK_URL?.trim();
  if (!endpoint) {
    throw new Error('RESPOND_IO_CHAT_WEBHOOK_URL is not set');
  }

  const timeoutMsRaw = Number(process.env.RESPOND_IO_CHAT_TIMEOUT_MS ?? 12000);
  const timeoutMs = Number.isFinite(timeoutMsRaw) ? Math.max(1000, timeoutMsRaw) : 12000;

  const latestUserMessage = [...input.messages].reverse().find((m) => m.role === 'user')?.content ?? '';

  const payload = {
    session_id: input.session_id ?? null,
    page_origin: input.page_origin ?? null,
    device_type: input.device_type ?? null,
    messages: input.messages,
    latest_user_message: latestUserMessage,
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const apiKey = process.env.RESPOND_IO_CHAT_API_KEY?.trim();
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: globalThis.Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`respond.io chat endpoint error ${response.status}: ${body}`);
  }

  let jsonPayload: unknown;
  try {
    jsonPayload = await response.json();
  } catch {
    throw new Error('respond.io chat endpoint returned invalid JSON');
  }

  const text = extractRespondIoText(jsonPayload);
  if (!text) {
    throw new Error('respond.io chat endpoint response has no assistant text');
  }

  return { text };
}
