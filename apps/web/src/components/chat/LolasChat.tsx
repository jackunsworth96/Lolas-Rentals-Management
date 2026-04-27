import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, X } from 'lucide-react';
import aiChatIcon from '../../assets/Buttons/ai chat icon.svg';
import { normalizeApiBase } from '../../api/normalize-api-base.js';

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);

const WHATSAPP_URL =
  "https://wa.me/639694443413?text=Hi%20Lola's%20Rentals%2C%20I%20have%20a%20question%20about%20renting%20a%20scooter";

const OPENING_MESSAGE =
  "Hey there! 🐾 I'm Lolo, Lola's assistant. Ask me anything about renting on Siargao — pricing, what's included, transfers, or anything else!";

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

/**
 * Renders a string that may contain basic markdown (bold, italic, inline-code)
 * into React elements. Each paragraph (blank-line-separated block) is its own
 * <p>; newlines within a block become <br />.
 */
function renderMarkdown(text: string): React.ReactNode {
  // Split into paragraphs on blank lines, then render each paragraph's inline spans.
  const paragraphs = text.split(/\n{2,}/);

  return paragraphs.map((para, pi) => {
    // Split the paragraph into lines so we can insert <br /> between them.
    const lines = para.split('\n');

    const renderedLines = lines.map((line, li) => (
      <span key={li}>
        {renderInline(line)}
        {li < lines.length - 1 && <br />}
      </span>
    ));

    return (
      <p key={pi} className={pi > 0 ? 'mt-2' : undefined}>
        {renderedLines}
      </p>
    );
  });
}

/** Converts inline markdown tokens (**bold**, *italic*, `code`) into spans. */
function renderInline(text: string): React.ReactNode {
  // Pattern: **bold**, *italic*, `code`
  const INLINE = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));

    if (match[2] !== undefined) {
      parts.push(<strong key={match.index} className="font-bold">{match[2]}</strong>);
    } else if (match[3] !== undefined) {
      parts.push(<em key={match.index}>{match[3]}</em>);
    } else if (match[4] !== undefined) {
      parts.push(
        <code key={match.index} className="rounded bg-charcoal-brand/10 px-1 py-0.5 font-mono text-xs">
          {match[4]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function TypingDots() {
  return (
      <span className="inline-flex items-center gap-1" aria-label="Lolo is typing">
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

// ── Draggable launcher position ──────────────────────────────────────────────

const SNAP_MARGIN = 28; // px from the viewport edge when snapped

interface Pos { x: number; y: number }

// Position stored as fractions of viewport dimensions so that zoom/resize
// always keeps the button proportionally anchored to the same corner.
interface PosRatio { rx: number; ry: number }

function ratioToPixels(rx: number, ry: number): Pos {
  return {
    x: Math.round(rx * window.innerWidth),
    y: Math.round(ry * window.innerHeight),
  };
}

function pixelsToRatio(x: number, y: number): PosRatio {
  return {
    rx: x / window.innerWidth,
    ry: y / window.innerHeight,
  };
}

function loadPosRatio(): PosRatio | null {
  try {
    const raw = sessionStorage.getItem('lolas-chat-pos-ratio');
    if (!raw) return null;
    return JSON.parse(raw) as PosRatio;
  } catch {
    return null;
  }
}

function savePosRatio(ratio: PosRatio) {
  try { sessionStorage.setItem('lolas-chat-pos-ratio', JSON.stringify(ratio)); } catch { /* noop */ }
}

function clampToViewport(x: number, y: number, btnSize: number): Pos {
  const maxX = window.innerWidth - btnSize - SNAP_MARGIN;
  const maxY = window.innerHeight - btnSize - SNAP_MARGIN;
  return {
    x: Math.max(SNAP_MARGIN, Math.min(x, maxX)),
    y: Math.max(SNAP_MARGIN, Math.min(y, maxY)),
  };
}

function snapToEdge(x: number, y: number, btnSize: number): Pos {
  const midX = window.innerWidth / 2;
  // Snap horizontally to whichever edge is closer
  const snappedX = x + btnSize / 2 < midX ? SNAP_MARGIN : window.innerWidth - btnSize - SNAP_MARGIN;
  const clampedY = Math.max(SNAP_MARGIN, Math.min(y, window.innerHeight - btnSize - SNAP_MARGIN));
  return { x: snappedX, y: clampedY };
}

function useDraggable(btnSize: number) {
  const defaultPos = (): Pos => ({
    x: window.innerWidth - btnSize - SNAP_MARGIN,
    y: window.innerHeight - btnSize - SNAP_MARGIN,
  });

  const [pos, setPos] = useState<Pos>(() => {
    const ratio = loadPosRatio();
    if (!ratio) return defaultPos();
    return clampToViewport(ratioToPixels(ratio.rx, ratio.ry).x, ratioToPixels(ratio.rx, ratio.ry).y, btnSize);
  });
  const dragging = useRef(false);
  const hasDragged = useRef(false);
  const startPointer = useRef<Pos>({ x: 0, y: 0 });
  const startPos = useRef<Pos>({ x: 0, y: 0 });

  // Re-anchor on resize and zoom — recompute pixel position from stored ratio
  // so the button stays in the same relative corner of the viewport.
  useEffect(() => {
    function onViewportChange() {
      const ratio = loadPosRatio();
      if (ratio) {
        const { x, y } = ratioToPixels(ratio.rx, ratio.ry);
        setPos(clampToViewport(x, y, btnSize));
      } else {
        setPos(defaultPos());
      }
    }
    window.addEventListener('resize', onViewportChange);
    // visualViewport fires on pinch-zoom and browser zoom on mobile/desktop
    window.visualViewport?.addEventListener('resize', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [btnSize]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag on primary button / touch
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    dragging.current = true;
    hasDragged.current = false;
    startPointer.current = { x: e.clientX, y: e.clientY };
    startPos.current = pos;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged.current = true;
    const newPos = clampToViewport(startPos.current.x + dx, startPos.current.y + dy, btnSize);
    setPos(newPos);
  }, [btnSize]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = e.clientX - startPointer.current.x;
    const dy = e.clientY - startPointer.current.y;
    const moved = Math.abs(dx) > 3 || Math.abs(dy) > 3;
    if (moved) {
      const snapped = snapToEdge(startPos.current.x + dx, startPos.current.y + dy, btnSize);
      setPos(snapped);
      savePosRatio(pixelsToRatio(snapped.x, snapped.y));
    }
  }, [btnSize]);

  return { pos, hasDragged, onPointerDown, onPointerMove, onPointerUp };
}

// ─────────────────────────────────────────────────────────────────────────────

const BUBBLE_MESSAGE = "Hey, I'm Lola's Assistant - Lolo! I can quickly answer most questions here 🐾";
const BUBBLE_DISMISS_MS = 7000;

export default function LolasChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForFirstToken, setWaitingForFirstToken] = useState(false);
  const [showBubble, setShowBubble] = useState(true);

  /** Launcher hit area + drag math; was 64px (h-16), +10% for visibility */
  const BTN_SIZE = 64 * 1.1;
  const { pos, hasDragged, onPointerDown, onPointerMove, onPointerUp } = useDraggable(BTN_SIZE);

  // Auto-dismiss the greeting bubble after a few seconds.
  useEffect(() => {
    if (!showBubble) return;
    const t = window.setTimeout(() => setShowBubble(false), BUBBLE_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [showBubble]);

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
      const response = await fetch(`${API_BASE}/public/chat`, {
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
      {/* Floating launcher button — draggable, snaps to nearest side */}
      {!open && (
        <>
          {/* Greeting speech bubble */}
          {showBubble && (
            <div
              style={{
                position: 'fixed',
                left: Math.max(8, Math.min(pos.x - 200 + BTN_SIZE / 2, window.innerWidth - 232)),
                top: pos.y - 88,
                zIndex: 59,
              }}
              className="animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="relative w-56 rounded-2xl rounded-br-sm bg-white px-4 py-3 shadow-lg ring-1 ring-charcoal-brand/10">
                <p className="font-lato pr-5 text-sm leading-snug text-charcoal-brand">
                  {BUBBLE_MESSAGE}
                </p>
                <button
                  type="button"
                  onClick={() => setShowBubble(false)}
                  aria-label="Dismiss"
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full text-charcoal-brand/40 transition-colors hover:bg-charcoal-brand/10 hover:text-charcoal-brand"
                >
                  <X className="h-3 w-3" />
                </button>
                {/* Tail pointing down-right toward the chat button */}
                <span
                  aria-hidden
                  className="absolute -bottom-2 right-4 h-0 w-0"
                  style={{
                    borderLeft: '8px solid transparent',
                    borderRight: '0px solid transparent',
                    borderTop: '8px solid white',
                    filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.06))',
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => {
              onPointerUp(e);
              // Only fire the open action when the button wasn't dragged
              if (!hasDragged.current) {
                setShowBubble(false);
                setOpen(true);
              }
            }}
            aria-label="Open chat with Lolo, Lola's Assistant"
            style={{ left: pos.x, top: pos.y, touchAction: 'none', width: BTN_SIZE, height: BTN_SIZE }}
            className="fixed z-[60] flex cursor-grab items-center justify-center bg-transparent p-0 transition-transform duration-150 active:cursor-grabbing active:scale-95 select-none"
          >
            <img
              src={aiChatIcon}
              alt=""
              className="h-full w-full object-contain"
              aria-hidden
              draggable={false}
            />
          </button>
        </>
      )}

      {/* Chat panel — mobile: slide-up sheet; desktop: floats near the icon */}
      {open && (() => {
        // On desktop, anchor the panel so it sits next to the snapped icon.
        // Determine which horizontal side the icon is on.
        const isRight = pos.x + BTN_SIZE / 2 > window.innerWidth / 2;
        const panelW = 400;
        const panelH = Math.min(448, window.innerHeight - 96);
        const desktopLeft = isRight
          ? Math.max(SNAP_MARGIN, pos.x - panelW + BTN_SIZE)
          : Math.min(pos.x, window.innerWidth - panelW - SNAP_MARGIN);
        const desktopTop = Math.max(
          SNAP_MARGIN,
          Math.min(pos.y + BTN_SIZE + 8, window.innerHeight - panelH - SNAP_MARGIN),
        );
        return (
        <div
          role="dialog"
          aria-label="Lolo chat"
          className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[calc(100dvh-0.75rem)] flex-col overflow-hidden rounded-t-3xl bg-sand-brand pb-[env(safe-area-inset-bottom,0px)] shadow-2xl ring-1 ring-charcoal-brand/10
                     h-[min(72dvh,28rem)]
                     md:inset-auto md:rounded-3xl md:pb-0"
          style={{
            // desktop: position alongside the dragged icon
            ...(window.innerWidth >= 768
              ? {
                  left: desktopLeft,
                  top: desktopTop,
                  width: panelW,
                  height: panelH,
                  maxHeight: `calc(100dvh - ${SNAP_MARGIN * 2}px)`,
                }
              : {}),
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-charcoal-brand/10 bg-cream-brand px-5 pb-3 pt-4">
            <div className="flex items-center gap-3">
              <img
                src={aiChatIcon}
                alt=""
                className="h-12 w-12 shrink-0 object-contain"
                aria-hidden
              />
              <div className="leading-tight">
                <p className="font-headline text-lg font-bold text-charcoal-brand">
                  Lolo 🐾
                </p>
                <p className="font-lato text-xs text-charcoal-brand/60">
                  Lola's AI assistant — ask me anything
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
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
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
                      ) : isUser ? (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      ) : (
                        <div className="space-y-0">
                          {renderMarkdown(msg.content)}
                          {msg.streaming && msg.content.length > 0 && (
                            <span className="ml-0.5 inline-block h-3 w-1 animate-pulse bg-teal-brand/60 align-middle" />
                          )}
                        </div>
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
                className="font-lato max-h-28 min-h-0 flex-1 resize-none bg-transparent py-2 text-sm leading-normal text-charcoal-brand placeholder:text-charcoal-brand/40 focus:outline-none disabled:opacity-60"
                style={{ resize: 'none', overflowY: 'hidden' }}
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
        );
      })()}
    </>
  );
}
