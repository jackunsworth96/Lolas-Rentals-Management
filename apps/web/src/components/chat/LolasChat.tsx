import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, X } from 'lucide-react';
import pawPrint from '../../assets/Paw Print.svg';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const WHATSAPP_URL =
  "https://wa.me/639694443413?text=Hi%20Lola's%20Rentals%2C%20I%20have%20a%20question%20about%20renting%20a%20scooter";

const OPENING_MESSAGE =
  "Hey there! 🐾 I'm Lola's Assistant. Ask me anything about renting on Siargao — pricing, what's included, transfers, or anything else!";

const HANDOFF_TOKEN = 'WHATSAPP_HANDOFF';

/** Max messages kept in the conversation history (cost control). */
const MAX_HISTORY = 10;

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Streamed content arrives here; true while the assistant is still typing. */
  streaming?: boolean;
  /** True if this assistant message asked to hand off to WhatsApp. */
  handoff?: boolean;
  /** True if this message should show the WhatsApp fallback button (errors). */
  errored?: boolean;
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function stripHandoffToken(text: string): { text: string; handoff: boolean } {
  if (!text.includes(HANDOFF_TOKEN)) return { text, handoff: false };
  const cleaned = text
    .split('\n')
    .filter((line) => line.trim() !== HANDOFF_TOKEN)
    .join('\n')
    .replace(new RegExp(HANDOFF_TOKEN, 'g'), '')
    .trim();
  return { text: cleaned, handoff: true };
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Lola's Assistant is typing">
      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-brand [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-brand [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-brand" />
    </span>
  );
}

function WhatsAppButton({ label = '💬 Chat with us on WhatsApp' }: { label?: string }) {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="font-lato mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-bold text-white shadow-sm transition-opacity duration-200 hover:opacity-90"
    >
      {label}
    </a>
  );
}

export default function LolasChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Seed the opening message once when the panel is first opened.
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([
        { id: makeId(), role: 'assistant', content: OPENING_MESSAGE },
      ]);
    }
  }, [open, messages.length]);

  // Auto-focus the input when the panel opens.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Auto-scroll to the latest message on any change.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');

    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: text };
    const assistantId = makeId();
    const assistantPlaceholder: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
    };

    const nextMessages = [...messages, userMessage, assistantPlaceholder];
    setMessages(nextMessages);
    setSending(true);
    setWaitingForFirstToken(true);

    // Build the conversation history sent to Claude — only role+content,
    // keep the last MAX_HISTORY user+assistant turns (excluding the streaming placeholder
    // and the opening greeting) for cost control.
    const historyForApi = nextMessages
      .filter((m) => m.id !== assistantId)
      .filter((m) => !(m.role === 'assistant' && m.content === OPENING_MESSAGE))
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content }));

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_BASE}/api/public/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: historyForApi }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Server-Sent Events: events are separated by blank lines; within each
        // event the JSON payload is on a line beginning with "data: ".
        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
          const rawLine = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          const line = rawLine.trim();
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              delta?: { type?: string; text?: string };
            };
            if (
              parsed.type === 'content_block_delta' &&
              parsed.delta?.type === 'text_delta' &&
              typeof parsed.delta.text === 'string'
            ) {
              accumulated += parsed.delta.text;
              if (waitingForFirstToken) setWaitingForFirstToken(false);
              const { text: visible, handoff } = stripHandoffToken(accumulated);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: visible, streaming: true, handoff }
                    : m,
                ),
              );
            }
          } catch {
            // Ignore malformed SSE frames — stream may resume on the next line.
          }
        }
      }

      const { text: finalText, handoff } = stripHandoffToken(accumulated);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  finalText ||
                  "Sorry, I didn't catch that — could you rephrase?",
                streaming: false,
                handoff,
              }
            : m,
        ),
      );
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') {
        // Silently drop aborted requests.
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Sorry, I'm having trouble connecting. Please try WhatsApp instead.",
                  streaming: false,
                  errored: true,
                }
              : m,
          ),
        );
      }
    } finally {
      setSending(false);
      setWaitingForFirstToken(false);
      abortRef.current = null;
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  return (
    <>
      {/* Floating launcher button */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat with Lola's Assistant"
          className="fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-teal-brand text-white shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 md:bottom-8 md:right-8 md:h-16 md:w-16"
        >
          <img
            src={pawPrint}
            alt=""
            className="h-7 w-7 object-contain md:h-8 md:w-8"
            style={{ filter: 'brightness(0) invert(1)' }}
            aria-hidden
          />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Lola's Assistant chat"
          className="fixed z-[60] flex flex-col overflow-hidden bg-sand-brand shadow-2xl ring-1 ring-charcoal-brand/10
                     inset-x-0 bottom-0 h-[80vh] rounded-t-3xl
                     md:inset-auto md:bottom-8 md:right-8 md:h-[520px] md:w-[400px] md:rounded-3xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-charcoal-brand/10 bg-cream-brand px-5 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-brand">
                <img
                  src={pawPrint}
                  alt=""
                  className="h-5 w-5 object-contain"
                  style={{ filter: 'brightness(0) invert(1)' }}
                  aria-hidden
                />
              </div>
              <div className="leading-tight">
                <p className="font-headline text-lg font-bold text-charcoal-brand">
                  Lola&apos;s Assistant 🐾
                </p>
                <p className="font-lato text-xs text-charcoal-brand/60">
                  Ask me anything about your rental
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="flex h-8 w-8 items-center justify-center rounded-full text-charcoal-brand/60 transition-colors hover:bg-charcoal-brand/5 hover:text-charcoal-brand"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ scrollBehavior: 'smooth' }}
          >
            <div className="flex flex-col gap-3">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isAssistantTyping =
                  !isUser && msg.streaming && msg.content.length === 0;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] font-lato text-sm leading-relaxed ${
                        isUser
                          ? 'rounded-2xl rounded-tr-sm bg-teal-brand px-4 py-2 text-white'
                          : 'rounded-2xl rounded-tl-sm bg-white px-4 py-2 text-charcoal-brand shadow-sm'
                      }`}
                    >
                      {isAssistantTyping ? (
                        <TypingDots />
                      ) : (
                        <p className="whitespace-pre-wrap">
                          {msg.content}
                          {!isUser && msg.streaming && msg.content.length > 0 && (
                            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-teal-brand/60 align-middle" />
                          )}
                        </p>
                      )}
                      {!isUser && !msg.streaming && (msg.handoff || msg.errored) && (
                        <WhatsAppButton />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Input */}
          <div className="border-t border-charcoal-brand/10 bg-sand-brand px-3 pb-2 pt-3">
            <div className="flex items-end gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-charcoal-brand/10 focus-within:ring-teal-brand">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={1}
                placeholder="Ask me anything..."
                className="font-lato max-h-28 flex-1 resize-none bg-transparent text-sm text-charcoal-brand placeholder:text-charcoal-brand/40 focus:outline-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={sending || input.trim().length === 0}
                aria-label="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-brand text-white transition-opacity duration-200 hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 text-center">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="font-lato text-[11px] text-charcoal-brand/60 underline decoration-charcoal-brand/30 underline-offset-2 transition-colors hover:text-teal-brand"
              >
                Prefer WhatsApp? Chat with us →
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
