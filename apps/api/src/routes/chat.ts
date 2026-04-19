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
});

// ── Live pricing cache ────────────────────────────────────────────────────────

let pricingCache: { data: string; fetchedAt: number } | null = null;
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

// ── System prompt ─────────────────────────────────────────────────────────────
// {{LIVE_PRICING}} is replaced at request time with the live pricing block.

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

WHAT'S INCLUDED WITH EVERY SCOOTER RENTAL (free)
Helmet · Full Tank of Fuel · Paw Card · Rain Coat · First Aid Kit · Repair Kit · Phone Mount · Seat Cloth · 5L Dry Bag · Free Riding Lesson · Crash Armour.

OPTIONAL UPGRADES (extra)
Peace of Mind damage cover · Surf Rack · Bungee Cord · Delivery & Collection · Late (9 PM) Return.

HELMETS
- One sanitised helmet is included free. A second can be requested in the basket.
- Helmets are required by law and must be worn at all times.

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
- Valid driver's licence required at pickup (international licences accepted).
- Helmets must be worn at all times — it's the law.
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

// ── Router ────────────────────────────────────────────────────────────────────

const router = Router();

router.post('/', chatLimiter, async (req, res, next) => {
  try {
    const parsed = ChatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: 'Invalid request body' });
      return;
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      logger.error('ANTHROPIC_API_KEY is not set');
      res.status(503).json({ success: false, error: 'Chat service unavailable' });
      return;
    }

    // Fetch live pricing; fall back to static copy on any error.
    let livePricing = STATIC_PRICING_FALLBACK;
    try {
      livePricing = await fetchLivePricing();
    } catch (pricingErr) {
      logger.warn({ err: pricingErr }, 'Live pricing fetch failed — using static fallback');
    }

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{{LIVE_PRICING}}', livePricing);

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
  } catch (err) {
    next(err);
  }
});

export { router as chatRouter };
