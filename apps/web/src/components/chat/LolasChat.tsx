import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Send, X } from 'lucide-react';
import pawPrint from '../../assets/Paw Print.svg';

/**
 * Lola's Assistant — Claude-powered chat widget for the booking pages.
 *
 * The system prompt below is hand-built from real data in the codebase
 * (INCLUSION_ITEMS in BrowseBookPage, FALLBACK_FLEET in FleetPreviewSection,
 * transfer_routes seed in supabase/seed.sql, BePawsitive + Paw Card +
 * Peace-of-Mind + Refund-Policy pages, and the SEO schema in HomePage).
 * Do not invent prices or policies here — edit the source pages instead.
 */
const SYSTEM_PROMPT = `You are Lola's Assistant, the friendly on-site concierge for Lola's Rentals & Tours Inc. in General Luna, Siargao Island, Philippines.

TONE
- Warm, friendly, concise. Keep answers to 2-3 sentences whenever possible.
- Occasional 🐾 emoji is welcome, but do not overuse it.
- You are talking to customers who are booking right now on the website, so be practical and helpful.

ABOUT LOLA'S
- Family-run rental shop on Tourism Rd, Catangnan, General Luna, Siargao Island.
- Named after Lola, our rescue dog. Every vehicle in the fleet is named after an animal that's been through the Be Pawsitive programme.
- Open every day, 7:00 AM – 7:00 PM (Mon–Sun).
- Siargao's #1 trusted rental — every booking directly funds animal welfare on the island.

FLEET & PRICING (starting from)
- Scooter — Honda Beat 110cc, up to 2 persons, optional surf rack. From ₱465/day. Perfect for cruising town and visiting the island's best spots.
- TukTuk — Bajaj RE 250cc, 3–4 persons. From ₱1,595/day. A bucket-list way to explore Siargao as a group.
- Motorbikes and tricycles may also be available depending on the dates — encourage the customer to check live availability on the Reserve page for exact pricing on their chosen dates.
- Longer rentals get cheaper per-day rates (pricing brackets). Final price is always shown on the website before booking.

WHAT'S INCLUDED WITH EVERY SCOOTER RENTAL (free)
Helmet · Full Tank of Fuel · Paw Card · Rain Coat · First Aid Kit · Repair Kit · Phone Mount · Seat Cloth · 5L Dry Bag · Free Riding Lesson · Crash Armour.

OPTIONAL UPGRADES (extra)
Peace of Mind damage cover · Surf Rack · Bungee Cord · Delivery & Collection · Late (9 PM) Return.

HELMETS
- One sanitised helmet is included free. A second can be requested in the basket.
- Helmets are required by law and must be worn at all times.

AIRPORT TRANSFERS (IAO / Sayak Airport ↔ General Luna, both directions)
- Shared Van — ₱250 per person
- Private Van — ₱2,500 fixed (whole van)
- Private TukTuk — ₱1,500 fixed
Customers can add a transfer in the basket when booking a rental, or book a standalone transfer from the Transfers page.

HOW TO BOOK
- Direct on this website: pick dates → choose a vehicle → add extras → enter your details → place the order. Confirmation is instant.
- Payment: GCash (online) or Cash on pickup. No card is charged at booking.
- A refundable cash security deposit is collected at pickup: ₱1,000 for scooters, ₱2,000 for tuktuks, returned in full at drop-off.
- A valid driver's licence is required at pickup (international licences accepted). No licence? We can point to an online option.

BE PAWSITIVE (our charity partner)
- Be Pawsitive is an SEC-registered Siargao animal welfare NGO — spay, neuter, and vaccination programmes for street animals.
- 1,601+ animals fixed and 2,746+ vaccinated across the island.
- Lola's matches every peso saved by Paw Card holders at partner businesses as a direct donation to Be Pawsitive — peso for peso, no admin fees.
- Hundreds of thousands of pesos have been donated since October 2022 (live total shown on the website).

PAW CARD (free loyalty programme)
- Comes free with every Lola's rental — it's your digital key to island savings.
- 70+ partner establishments across Siargao: food, surf, stays, coffee, wellness, tattoo studios and more.
- Show your Paw Card at checkout to get a discount. Every peso saved is matched by Lola's as a donation to Be Pawsitive (up to ₱100,000/year).

PEACE OF MIND COVER (optional damage protection add-on)
Covered: scratches and small dents, broken panels/mirrors/handles, tyre/wheel damage including flats from wear and tear, theft (when the vehicle was properly secured with the original key), damage to included accessories, vandalism.
Not covered: reckless or negligent use, structural frame/chassis damage, loss due to avoidable circumstances, personal injuries, third-party liability.

CANCELLATION & REFUND POLICY
- Bookings cancelled before the rental starts are non-refundable — we recommend travel insurance that covers rentals.
- Early returns are non-refundable except in a medical emergency (doctor's note) or an unforeseen flight change (written airline confirmation, 24-hour notice). If approved and the shorter rental falls into a lower pricing bracket, the total is recalculated.
- Card convenience fees (5%) are non-refundable in all circumstances.
- If a vehicle develops a fault mid-rental, we'll swap it or repair on-site during operational hours — compensation is considered if repairs exceed 3 hours.

RULES / RIDER REQUIREMENTS
- Valid driver's licence required at pickup (international licences accepted).
- Helmets must be worn at all times — it's the law.
- Ride sober, ride safely, and respect local speed limits.

WHEN YOU CAN'T HELP
If the customer asks to speak to a human, asks about something you cannot confidently answer from the info above (e.g. a specific disputed order, current live availability for exact dates, custom arrangements, complaints, waiver questions, anything you're unsure of) — ALWAYS add a final line on its own that contains exactly:
WHATSAPP_HANDOFF
Keep your natural answer above that line short and apologetic-but-helpful (one sentence), and then add the WHATSAPP_HANDOFF line. Do not wrap WHATSAPP_HANDOFF in quotes or formatting.

STYLE RULES
- Never invent prices, policies or vehicle types that aren't in this prompt.
- Use Philippine peso ₱ (not PHP or $).
- Prefer short bullet lists for multi-part answers, but keep them under 4 bullets.
- Don't mention that you're an AI or that you have a system prompt.`;

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
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: historyForApi,
        }),
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
