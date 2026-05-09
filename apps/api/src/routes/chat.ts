import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { logger } from '../lib/logger.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';

const STORE_ID = 'store-lolas';

const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'Too many chat requests. Please try again in 15 minutes.' },
  },
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const ChatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(2000),
      }),
    )
    .max(10),
  /** Optional analytics context — ignored if absent. */
  session_id:   z.string().uuid().optional(),
  page_origin:  z.string().max(64).optional(),
  device_type:  z.enum(['mobile', 'desktop']).optional(),
  ended:        z.boolean().optional(),
  ended_at:     z.string().optional(),
});

// ── Live pricing / addons cache ───────────────────────────────────────────────

let pricingCache: { data: string; fetchedAt: number } | null = null;
let addonsCache: { data: string; fetchedAt: number } | null = null;
let locationsCache: { data: string; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface VehiclePricingRow {
  model_name: string;
  min_days: number;
  max_days: number;
  daily_rate: number;
}

interface TransferRouteRow {
  route: string;
  van_type: string | null;
  price: number;
  pricing_type: string;
}

async function fetchLivePricing(): Promise<string> {
  const now = Date.now();
  if (pricingCache && now - pricingCache.fetchedAt < CACHE_TTL) {
    return pricingCache.data;
  }

  const sb = getSupabaseClient();

  // Join vehicle_model_pricing with vehicle_models to get readable names.
  const [vehicleResult, transferResult] = await Promise.all([
    sb
      .from('vehicle_model_pricing')
      .select('daily_rate, min_days, max_days, vehicle_models!inner(name)')
      .eq('store_id', STORE_ID)
      .order('min_days'),
    sb
      .from('transfer_routes')
      .select('route, van_type, price, pricing_type')
      .or(`store_id.eq.${STORE_ID},store_id.is.null`)
      .eq('is_active', true)
      .order('van_type'),
  ]);

  if (vehicleResult.error) throw new Error(`Pricing fetch failed: ${vehicleResult.error.message}`);
  if (transferResult.error) throw new Error(`Transfer fetch failed: ${transferResult.error.message}`);

  // ── Format vehicle pricing ────────────────────────────────────────────────

  // Each row: { daily_rate, min_days, max_days, vehicle_models: { name } }
  const rawRows = (vehicleResult.data ?? []) as unknown as Array<{
    daily_rate: number;
    min_days: number;
    max_days: number;
    vehicle_models: { name: string };
  }>;

  // Group brackets by model name, preserving insertion order.
  const byModel = new Map<string, VehiclePricingRow[]>();
  for (const row of rawRows) {
    const name = row.vehicle_models?.name ?? 'Unknown';
    if (!byModel.has(name)) byModel.set(name, []);
    byModel.get(name)!.push({
      model_name: name,
      min_days: Number(row.min_days),
      max_days: Number(row.max_days),
      daily_rate: Number(row.daily_rate),
    });
  }

  const vehicleLines: string[] = [];
  for (const [modelName, brackets] of byModel) {
    const sorted = [...brackets].sort((a, b) => a.min_days - b.min_days);
    const bracketParts = sorted.map((b) => {
      const range =
        b.min_days === b.max_days
          ? `${b.min_days} day`
          : b.max_days >= 999
          ? `${b.min_days}+ days`
          : `${b.min_days}–${b.max_days} days`;
      return `${range} ₱${Math.round(b.daily_rate).toLocaleString()}/day`;
    });
    vehicleLines.push(`- ${modelName}: ${bracketParts.join(' | ')}`);
  }

  // ── Format transfer pricing ───────────────────────────────────────────────

  const transfers = (transferResult.data ?? []) as unknown as TransferRouteRow[];
  const transferLines: string[] = [];
  for (const t of transfers) {
    const vanLabel = t.van_type
      ? t.van_type
          .split(/[\s_-]+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      : 'Transfer';
    const priceStr = `₱${Math.round(Number(t.price)).toLocaleString()}`;
    const suffix = t.pricing_type === 'per_head' ? 'per person' : 'flat';
    transferLines.push(`- ${vanLabel}: ${priceStr} ${suffix}`);
  }

  // ── Assemble ──────────────────────────────────────────────────────────────

  const block = [
    'CURRENT LIVE PRICING (fetched in real-time):',
    '',
    'Vehicle Pricing:',
    ...(vehicleLines.length > 0 ? vehicleLines : ['- Pricing unavailable — please check the website.']),
    '',
    'Airport Transfers (IAO / Sayak Airport ↔ General Luna, both directions):',
    ...(transferLines.length > 0 ? transferLines : ['- Transfer pricing unavailable — please check the website.']),
    'Customers can add a transfer in the basket when booking a rental, or book a standalone transfer from the Transfers page.',
  ].join('\n');

  pricingCache = { data: block, fetchedAt: now };
  return block;
}

interface AddonRow {
  name: string;
  addon_type: string;
  price_per_day: number;
  price_one_time: number;
}

async function fetchLiveAddons(): Promise<string> {
  const now = Date.now();
  if (addonsCache && now - addonsCache.fetchedAt < CACHE_TTL) {
    return addonsCache.data;
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('addons')
    .select('name, addon_type, price_per_day, price_one_time')
    .eq('is_active', true)
    .or(`store_id.eq.${STORE_ID},store_id.is.null`)
    .order('name');

  if (error) throw new Error(`Addons fetch failed: ${error.message}`);

  const rows = (data ?? []) as AddonRow[];
  const lines = rows.map((a) => {
    const price =
      a.addon_type === 'per_day'
        ? `₱${Math.round(Number(a.price_per_day)).toLocaleString()}/day`
        : `₱${Math.round(Number(a.price_one_time)).toLocaleString()} one-time (flat fee for the entire rental)`;
    return `- ${a.name}: ${price}`;
  });

  const block = [
    'OPTIONAL EXTRAS — LIVE PRICING (fetched in real-time):',
    ...(lines.length > 0 ? lines : ['- No extras currently available.']),
  ].join('\n');

  addonsCache = { data: block, fetchedAt: now };
  return block;
}

interface LocationRow {
  name: string;
  delivery_cost: number;
  collection_cost: number;
  location_type: string | null;
  store_id: string | null;
}

/** Active pickup / delivery areas from Settings → Locations (same rules as back office). */
async function fetchLivePickupDeliveryLocations(): Promise<string> {
  const now = Date.now();
  if (locationsCache && now - locationsCache.fetchedAt < CACHE_TTL) {
    return locationsCache.data;
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from('locations')
    .select('name, delivery_cost, collection_cost, location_type, store_id')
    .eq('is_active', true)
    .or(`store_id.eq.${STORE_ID},store_id.is.null`)
    .order('name');

  if (error) throw new Error(`Locations fetch failed: ${error.message}`);

  const rows = (data ?? []) as LocationRow[];
  const lines: string[] = [];

  for (const row of rows) {
    const name = row.name?.trim() || 'Area';
    const locType = (row.location_type ?? '').toLowerCase();
    const isStore = locType === 'store';
    const scope =
      row.store_id == null
        ? ' (all store bookings)'
        : " (Lola's Rentals bookings)";
    if (isStore) {
      lines.push(
        `- **${name}** — shop pickup & return: delivery **₱0**, collection **₱0**${scope}.`,
      );
    } else {
      const d = Math.round(Number(row.delivery_cost));
      const c = Math.round(Number(row.collection_cost));
      lines.push(
        `- ${name}: delivery **₱${d.toLocaleString()}**, collection **₱${c.toLocaleString()}**${scope}.`,
      );
    }
  }

  const block = [
    'DELIVERY & COLLECTION — LIVE AREAS (from back office Settings → Locations):',
    '- **We do offer** vehicle delivery and collection for rentals. Fees depend on the area — use only the list below.',
    '',
    ...(lines.length > 0
      ? lines
      : ['- Area list unavailable — ask the team on WhatsApp for your location.']),
    '',
    'Airport transfers are separate from rental delivery/collection (see transfer pricing above).',
  ].join('\n');

  locationsCache = { data: block, fetchedAt: now };
  return block;
}

// ── System prompt ─────────────────────────────────────────────────────────────
// {{LIVE_PRICING}}, {{LIVE_ADDONS}}, {{LIVE_PICKUP_DELIVERY}} replaced at request time.

const SYSTEM_PROMPT_TEMPLATE = `You are Lola's Assistant, the friendly on-site concierge for Lola's Rentals & Tours Inc. in General Luna, Siargao Island, Philippines.

TONE
- Warm, friendly, concise. Keep answers to 2-3 sentences whenever possible.
- Occasional 🐾 emoji is welcome, but do not overuse it.
- You are talking to customers who are booking right now on the website, so be practical and helpful.

ABOUT LOLA'S
- Family-run rental shop on Tourism Rd, Catangnan, General Luna, Siargao Island.
- Named after Lola, our rescue dog. Every vehicle in the fleet is named after an animal that's been through the Be Pawsitive programme.
- Open every day, 9:00 AM – 5:00 PM (Mon–Sun).
- Siargao's #1 trusted rental — every booking directly funds animal welfare on the island.

{{LIVE_PRICING}}
- Longer rentals get cheaper per-day rates (pricing brackets). Final price is always shown on the website before booking.
- Motorbikes and tricycles may also be available depending on the dates — encourage the customer to check live availability on the Reserve page for exact pricing on their chosen dates.

VEHICLE SPECS
- Honda Beat (scooter): 110cc, automatic transmission. Suitable for most riders. Optional surf rack add-on is available (see optional extras).
- TukTuk (Bajaj RE): 250cc, manual transmission. A riding lesson is provided for every tuktuk customer before they set off — no experience required, but you do need to be comfortable by the end of the lesson. TukTuk cannot carry a surfboard and has no surf rack; do not suggest surf rack or board transport for TukTuk.

RIDING LESSONS
- A free riding lesson is included with every scooter rental and is also available on request if a customer needs it.
- TukTuk lessons are mandatory — every tuktuk customer gets one before riding.
- With all lessons, there is absolutely no obligation to rent. If either the customer or we feel they are not confident enough to ride safely, the rental simply won't proceed — no hard feelings and no charge.

WHAT'S INCLUDED WITH EVERY SCOOTER RENTAL (free)
Helmet · Full Tank of Fuel · Paw Card · Rain Coat · First Aid Kit · Repair Kit · Phone Mount · Seat Cloth · 5L Dry Bag · Free Riding Lesson · Crash Armour.

WHAT'S INCLUDED WITH EVERY TUK TUK RENTAL (free)
- These are not the same as scooter inclusions. Do not tell TukTuk customers they get scooter items (e.g. helmets, phone mount, repair kit, crash armour, seat cloth) unless you are explicitly told otherwise in this prompt.
- Included: rain coats, dry bag, first aid kit, mini cool box, umbrella, and the Paw Card (free loyalty programme with partner discounts).
- TukTuk is an enclosed vehicle — helmet inclusions and helmet law guidance for two-wheel scooters do not apply; never describe TukTuk rentals as including helmets.

{{LIVE_ADDONS}}

{{LIVE_PICKUP_DELIVERY}}

PICKUP, DELIVERY & COLLECTION RULES
- When customers ask where they can pick up, drop off, or whether you deliver/collect vehicles, use **only** the live area list above — names and ₱ amounts must match it. Never say we do not offer delivery/collection if that list has areas with fees or a store pickup row.
- "Delivery" / "collection" here means bringing the rental vehicle to the customer's area or collecting it after the rental (not the airport transfer vans).
- Rows marked as the **shop / ₱0** option mean customers can pick up and return at the physical store with no delivery charge.
- Rows marked "(all store bookings)" apply across company stores; "(Lola's Rentals bookings)" applies when booking with this shop.

EXTRAS RULES
- Surf Rack and Bungee Cord are scooter-only extras — never offer or imply these for TukTuk.
- TukTuk extras: Peace of Mind Cover (TukTuk), Delivery & Collection, Late Return (9 PM). Nothing else from the scooter list. Delivery & collection fees follow the live area list above when customers choose that extra.
- TukTuk cannot carry a surfboard and has no surf rack.
- All extras are added in the basket when booking on the website.

HELMETS (scooter / two-wheel motorbike rentals only; not TukTuk)
- One sanitised helmet is included free with scooters. A second can be requested in the basket.
- For two-wheel vehicles, helmets are required by law and must be worn at all times.
- Do not apply this helmet block to TukTuk — TukTuk inclusions and rules are separate (see above).

HOW TO BOOK
- Direct on this website: pick dates → choose a vehicle → add extras → enter your details → place the order. Confirmation is instant.
- Payment: GCash (online) or Cash on pickup. No card is charged at booking.
- A refundable cash security deposit is collected at pickup: ₱1,000 for scooters, ₱2,000 for tuktuks, returned in full at drop-off.
- A valid driver's licence is required at pickup (international licences accepted). An IDP is not required in the Philippines, though other SE Asian countries may ask for one.

BE PAWSITIVE (our charity partner)
- Be Pawsitive is an SEC-registered Siargao animal welfare NGO — spay, neuter, and vaccination programmes for street animals.
- 1,601+ animals fixed and 2,746+ vaccinated across the island.
- Lola's matches every peso saved by Paw Card holders at partner businesses as a direct donation to Be Pawsitive — peso for peso, no admin fees.
- Hundreds of thousands of pesos have been donated since October 2022 (live total shown on the website).

PAW CARD (free loyalty programme)
- Comes free with every Lola's rental — it's your digital key to island savings.
- 70+ partner establishments across Siargao: food, surf, stays, coffee, wellness, tattoo studios and more.
- Show your Paw Card at checkout to get a discount. Every peso saved is matched by Lola's as a donation to Be Pawsitive (up to ₱100,000/year).

PAW CARD PROMOTION
- Every rental includes a free Siargao Paw Card — discounts at 70+ island businesses including restaurants, surf shops, and spas. Use it proactively and your savings could actually make us cheaper than the budget options. 🐾

PEACE OF MIND COVER (optional damage protection add-on)
Covered: scratches and small dents, broken panels/mirrors/handles, tyre/wheel damage including flats from wear and tear, theft (when the vehicle was properly secured with the original key), damage to included accessories, vandalism.
Not covered: reckless or negligent use, structural frame/chassis damage, loss due to avoidable circumstances, personal injuries, third-party liability.

CANCELLATION & REFUND POLICY
- Bookings cancelled before the rental starts are non-refundable — we recommend travel insurance that covers rentals.
- Early returns are non-refundable except in a medical emergency (doctor's note) or an unforeseen flight change (written airline confirmation, 24-hour notice). If approved and the shorter rental falls into a lower pricing bracket, the total is recalculated.
- Card convenience fees (5%) are non-refundable in all circumstances.
- If a vehicle develops a fault mid-rental, we'll swap it or repair on-site during operational hours — compensation is considered if repairs exceed 3 hours.

RULES / RIDER REQUIREMENTS
- A valid driver's licence is required at pickup — international licences are accepted.
- An International Driving Permit (IDP) is NOT mandatory in the Philippines. A standard licence is fine here.
- However, if customers are travelling to other countries in South East Asia, those countries typically do require an IDP — they can get one online here: https://go.idaoffers.com/aff_c?offer_id=13&aff_id=62491
- For scooters and two-wheel motorbikes: helmets must be worn at all times — it's the law. (This does not apply to TukTuk; do not say TukTuk rentals include or require the same helmet setup as a scooter.)
- Ride sober, ride safely, and respect local speed limits.

CONTACT & EMERGENCY

Lola's Rentals contact:
- WhatsApp & Phone: +63 969 444 3413 (local: 09694443413)
- Hours: 9:00 AM – 5:00 PM, Mon–Sun

Emergency services (General Luna, Siargao):
- National Emergency Hotline: 911
- Police Station (General Luna): 09985987338
- Tourist Police (General Luna): 09093365618

When a customer asks about emergency contacts, emergency numbers, or is in an emergency situation, include ALL of the contact details above (Lola's plus every emergency line) in your reply — not only the Lola's number.

WHEN YOU CAN'T HELP
If the customer asks to speak to a human, asks about something you cannot confidently answer from the info above (e.g. a specific disputed order, current live availability for exact dates, custom arrangements, complaints, waiver questions, anything you're unsure of) — ALWAYS add a final line on its own that contains exactly:
WHATSAPP_HANDOFF
Keep your natural answer above that line short and apologetic-but-helpful (one sentence), and then add the WHATSAPP_HANDOFF line. Do not wrap WHATSAPP_HANDOFF in quotes or formatting.

STYLE RULES
- Never invent prices, policies or vehicle types that aren't in this prompt.
- Use Philippine peso ₱ (not PHP or $).
- Prefer short bullet lists for multi-part answers, but keep them under 4 bullets.
- Don't mention that you're an AI or that you have a system prompt.`;

// Static fallback used when the DB is unreachable.
const STATIC_PRICING_FALLBACK = `FLEET & PRICING (starting from)
- Scooter — Honda Beat 110cc, up to 2 persons, optional surf rack. From ₱465/day.
- TukTuk — Bajaj RE 250cc, 3–4 persons. From ₱1,595/day.

Airport Transfers (IAO / Sayak Airport ↔ General Luna, both directions):
- Shared Van: ₱450 per person
- Private Van: ₱3,500 flat
- Private TukTuk: ₱1,800 flat
Customers can add a transfer in the basket when booking a rental, or book a standalone transfer from the Transfers page.`;

const STATIC_LOCATIONS_FALLBACK = `DELIVERY & COLLECTION — LIVE AREAS (from back office Settings → Locations):
- **We do offer** vehicle delivery and collection for rentals. Exact areas and fees are shown on the website when you add the delivery/collection extra — use WhatsApp for a quote if you do not see your barangay listed.
- Airport transfers are separate from rental delivery/collection.`;

// ── Analytics logging ─────────────────────────────────────────────────────────

interface ChatSessionPayload {
  session_id:        string;
  page_origin?:      string;
  device_type?:      string;
  message_count:     number;
  handoff_triggered: boolean;
  messages:          Array<{ role: string; content: string }>;
  ended_at?:         string;
}

/**
 * Classify the user's messages into topic tags using a lightweight Anthropic
 * call. Returns an empty array if classification fails — never throws.
 */
async function classifyTopics(
  userMessages: string[],
  apiKey: string,
): Promise<string[]> {
  if (userMessages.length === 0) return [];

  const VALID_TOPICS = [
    'pricing', 'availability', 'booking', 'cancellation',
    'vehicles', 'helmets', 'extras', 'delivery', 'transfers', 'lesson',
    'pawcard', 'contact', 'other',
  ] as const;

  const prompt = `You are a topic classifier for a vehicle rental chatbot (Lola's Rentals, Siargao).
Given these customer messages, return a JSON array of 1–3 topic tags that best describe what the customer was asking about.

Valid tags: ${VALID_TOPICS.join(', ')}

Tag definitions:
- pricing: rates, costs, how much
- availability: whether a vehicle is free on certain dates
- booking: how to book, payment methods, deposit, confirmation
- cancellation: refunds, cancellations, early returns
- vehicles: scooter/tuktuk specs, differences between models
- helmets: helmet questions, safety gear
- extras: optional add-ons (surf rack, damage cover, late return)
- delivery: rental vehicle delivery/collection to an address or area (not airport transfers)
- transfers: airport transfers
- lesson: riding lessons
- pawcard: Paw Card, Be Pawsitive charity, partner discounts
- contact: wants to speak to a human / staff
- other: anything else

Customer messages:
${userMessages.map((m, i) => `${i + 1}. ${m}`).join('\n')}

Respond with ONLY a JSON array, e.g. ["pricing","availability"]. No other text.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 64,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) return [];

    const json = await response.json() as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((b) => b.type === 'text')?.text?.trim() ?? '';
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[])
      .filter((t): t is string => typeof t === 'string' && (VALID_TOPICS as readonly string[]).includes(t));
  } catch {
    return [];
  }
}

/** Fire-and-forget upsert — never throws, never blocks the response. */
function logChatSession(payload: ChatSessionPayload): void {
  const sb = getSupabaseClient();
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

  const upsertBase = {
    session_id:        payload.session_id,
    store_id:          STORE_ID,
    page_origin:       payload.page_origin ?? null,
    device_type:       payload.device_type ?? null,
    message_count:     payload.message_count,
    handoff_triggered: payload.handoff_triggered,
    messages:          payload.messages,
    ended_at:          payload.ended_at ?? null,
  };

  // For completed sessions, classify topics then upsert with tags.
  // For mid-session updates, upsert immediately without topics.
  if (payload.ended_at) {
    const userMessages = payload.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content);

    void classifyTopics(userMessages, apiKey)
      .then((topics) =>
        sb.from('chat_sessions').upsert(
          { ...upsertBase, topics },
          { onConflict: 'session_id' },
        ),
      )
      .then(({ error }) => {
        if (error) logger.warn({ err: error }, 'chat_sessions upsert failed');
      })
      .catch((err: unknown) => {
        logger.warn({ err }, 'chat_sessions upsert threw');
      });
  } else {
    void Promise.resolve(
      sb.from('chat_sessions').upsert(upsertBase, { onConflict: 'session_id' }),
    ).then(({ error }) => {
      if (error) logger.warn({ err: error }, 'chat_sessions upsert failed');
    }).catch((err: unknown) => {
      logger.warn({ err }, 'chat_sessions upsert threw');
    });
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

router.post('/', chatLimiter, async (req, res, next) => {
  try {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request body' });
      return;
    }

    const { session_id, page_origin, device_type, ended, ended_at, messages: msgList } = parsed.data;

    // Session-end ping: frontend signals the conversation is closed.
    // Log the final state and return early — no need to hit Anthropic.
    if (ended && session_id) {
      logChatSession({
        session_id,
        page_origin,
        device_type,
        message_count: msgList.length,
        handoff_triggered: msgList.some((m) => m.role === 'assistant' && m.content.includes('WHATSAPP_HANDOFF')),
        messages: msgList,
        ended_at: ended_at ?? new Date().toISOString(),
      });
      res.json({ success: true });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY is not set');
      res.status(503).json({ success: false, error: 'Chat service unavailable' });
      return;
    }

    // Fetch live pricing, add-ons, and delivery areas in parallel; fall back on errors.
    let livePricing = STATIC_PRICING_FALLBACK;
    let liveAddons = 'OPTIONAL EXTRAS — pricing unavailable, please check the website.';
    let liveLocations = STATIC_LOCATIONS_FALLBACK;
    try {
      [livePricing, liveAddons, liveLocations] = await Promise.all([
        fetchLivePricing(),
        fetchLiveAddons(),
        fetchLivePickupDeliveryLocations(),
      ]);
    } catch (bundleErr) {
      logger.warn({ err: bundleErr }, 'Live chat context fetch failed — using per-section fallback');
      try { livePricing = await fetchLivePricing(); } catch { /* keep fallback */ }
      try { liveAddons = await fetchLiveAddons(); } catch { /* keep fallback */ }
      try { liveLocations = await fetchLivePickupDeliveryLocations(); } catch { /* keep fallback */ }
    }

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE
      .replace('{{LIVE_PRICING}}', livePricing)
      .replace('{{LIVE_ADDONS}}', liveAddons)
      .replace('{{LIVE_PICKUP_DELIVERY}}', liveLocations);

    let upstream: globalThis.Response;
    try {
      upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1000,
          stream: true,
          system: systemPrompt,
          messages: parsed.data.messages,
        }),
      });
    } catch (fetchErr) {
      logger.error({ err: fetchErr }, 'Failed to reach Anthropic API');
      res.status(503).json({ success: false, error: 'Chat service unavailable' });
      return;
    }

    if (!upstream.ok || !upstream.body) {
      logger.error({ status: upstream.status }, 'Anthropic API returned an error');
      res.status(502).json({ success: false, error: 'Chat service unavailable' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const nodeStream = Readable.fromWeb(
      upstream.body as import('stream/web').ReadableStream<Uint8Array>,
    );
    nodeStream.pipe(res);
    nodeStream.on('error', (err) => {
      logger.error({ err }, 'Anthropic stream error');
      if (!res.headersSent) {
        res.status(502).json({ success: false, error: 'Chat service unavailable' });
      } else {
        res.end();
      }
    });

    // Log the session state after each exchange. The assistant reply hasn't
    // streamed yet so we log the user messages only; the frontend sends a
    // separate "ended" ping with the full transcript when the panel closes.
    if (session_id) {
      logChatSession({
        session_id,
        page_origin,
        device_type,
        message_count: msgList.length,
        handoff_triggered: false,
        messages: msgList,
      });
    }
  } catch (err) {
    next(err);
  }
});

export { router as chatRouter };
