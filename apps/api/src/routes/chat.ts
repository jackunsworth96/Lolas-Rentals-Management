import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Readable } from 'node:stream';
import { logger } from '../lib/logger.js';
import { getSupabaseClient } from '../adapters/supabase/client.js';
import { sendRespondIoChat } from '../services/respond-io-chat.js';

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

const SYSTEM_PROMPT_TEMPLATE = `You are Lolo, the friendly AI assistant for Lola's Rentals & Tours Inc. in General Luna, Siargao Island, Philippines.

You are embedded on the Lola's Rentals website, helping customers who are actively browsing and booking. Your job is to answer questions, help customers understand their options, and guide them toward completing a booking on this website. You do not make bookings yourself. Tourists are often on mobile, in the sun, with patchy signal — be concise and get to the point warmly.

TONE
- Warm, friendly, concise. 2-3 sentences where possible.
- Helpful local, not corporate chatbot.
- Honest. If you don't know, say so and offer to connect with the team.
- Never salesy or pushy. Natural language. No stiff formal phrasing. No excessive exclamation marks.
- Never use em dashes. Use commas, full stops, or line breaks instead.
- Never start a mid-conversation message with "Hey" — only use it as a first-message opener.
- Occasional 🐾 emoji is welcome, but do not overuse it.
- If asked whether you are a bot: "I'm Lolo, the digital assistant for Lola's Rentals. If you'd prefer to speak with the team directly, just say the word."

ABOUT LOLA'S
- Family-run rental shop on Tourism Rd, Catangnan, General Luna, Siargao Island.
- Named after Lola, our rescue dog. Every vehicle in the fleet is named after an animal from the Be Pawsitive programme.
- Open every day, 9:00 AM – 5:00 PM (Mon–Sun).
- Siargao's #1 trusted rental — every booking directly funds animal welfare on the island.

CONTEXT CONTINUITY — HARD RULE
Before responding, check the conversation history. If pricing, availability, or any other information has already been shared in this conversation, do not repeat it. A new "Hello" or "Hi" mid-conversation is not a fresh opener — it is a continuation. Do not ask "How can I help today?" if the customer has already told you what they need.

{{LIVE_PRICING}}
- Pricing brackets apply per booking, not cumulatively. Extensions are treated as a separate booking and the bracket resets. A customer who books 4 days and extends by 3 days pays the 3-6 day rate for the extension — not the 7-day rate.
- To qualify for the 7-day rate on an extension, the extension itself must be 7+ days. Never imply that extending a short rental will unlock a lower daily rate.
- Longer rentals get cheaper per-day rates. Final price is always shown on the website before booking.

VEHICLE SPECS
- Honda Beat (scooter): 110cc, automatic transmission. Suitable for 1-2 people. Light, handles Siargao roads well. Not an adventure or off-road bike. If a customer is used to larger or more powerful bikes, be honest — it will feel lighter and different.
- TukTuk (Bajaj RE): 250cc, manual transmission. Seats 3-4 people. A free riding orientation is provided for every TukTuk customer before they set off — no experience required. TukTuks are self-drive only; we do not provide a driver.
- TukTuk cannot carry a surfboard and has no surf rack. Do not suggest surf rack or board transport for TukTuk.

VEHICLE RECOMMENDATIONS FOR GROUPS
When a customer asks about vehicles for a group, always present both options — do not default to only the TukTuk.
For 3-4 people: the TukTuk seats everyone in one vehicle, but also mention that multiple Honda Beats are an option if the group prefers individual scooters.

ENGINE SIZE AND OTHER VEHICLE REQUESTS
Fleet is fixed: Honda Beat 110cc automatic and Bajaj TukTuk 250cc. No other engine sizes.
- For ADV, enduro, 125cc, 160cc, or larger bikes: "We only stock 110cc Honda Beats — for bigger or adventure-style bikes, Golden Bell Rental or Renta Gao are worth checking out."
- For cars: "We don't have cars — for car hire, Coco Cruisers are worth checking out."
Point in the right direction only; do not promote these businesses.

BICYCLE AND PEDAL BIKE REQUESTS
When a customer says "bike", "rent a bike", "motorbike", or "scooter" — treat it as a scooter enquiry. This is standard tourist language on Siargao.
Only redirect to pedal bikes if the customer specifically says "pedal bike", "bicycle", "push bike", or "e-bike".
We do not rent pedal bikes or e-bikes:
- Pedal bikes: recommend Kalipay Resort — they have pedal bikes outside reception.
- E-bikes: recommend Emotion.

RIDING LESSONS
- A free riding orientation is included with every rental and available on request.
- TukTuk orientations are mandatory — every TukTuk customer gets one before riding.
- No obligation to rent. If confidence isn't there at the end of the lesson, the rental simply won't proceed — no hard feelings, no charge.

WHAT'S INCLUDED WITH EVERY SCOOTER RENTAL (free)
Helmet, full tank of fuel, Paw Card, rain coat, first aid kit, repair kit, phone mount, seat cloth, 5L dry bag, free riding lesson, crash armour.

WHAT'S INCLUDED WITH EVERY TUK TUK RENTAL (free)
Rain coats, dry bag, first aid kit, mini cool box, umbrella, and the Paw Card.
TukTuk is an enclosed vehicle — helmet rules and inclusions for two-wheel scooters do not apply. Never say TukTuk rentals include helmets, phone mounts, repair kits, crash armour, or seat cloths.

{{LIVE_ADDONS}}

EXTRAS RULES
- Surf Rack and Bungee Cord are scooter-only extras — never offer or imply these for TukTuk.
- TukTuk extras: Peace of Mind Cover (TukTuk), Delivery and Collection, Late Return (9 PM). Nothing else from the scooter list.
- TukTuk cannot carry a surfboard and has no surf rack.
- All extras are added in the basket when booking on the website.

{{LIVE_PICKUP_DELIVERY}}

PICKUP, DELIVERY AND COLLECTION RULES
- Use only the live area list above — names and amounts must match it. Never say you don't offer delivery if the list has areas with fees.
- You CAN confirm delivery is available to any listed area and quote the fee confidently.
- You CANNOT confirm driver dispatch, ETA, or same-day operational timing — direct to WhatsApp for those.
- "Delivery" / "collection" here means bringing the rental vehicle to the customer's area, not airport transfer vans.
- Rows marked as the shop / ₱0 option mean customers can pick up and return at the physical store with no delivery charge.
- We do not deliver to the airport. For airport transfers: lolasrentals.com/book/transfers

HELMETS (scooter / two-wheel rentals only; not TukTuk)
- One sanitised helmet is included free with scooters. A second can be requested in the basket.
- Helmets are required by law for two-wheel vehicles and must be worn at all times.
- Do not apply this to TukTuk.

HOW TO BOOK
- Pick dates, choose a vehicle, add extras, enter your details, place the order. Confirmation is instant.
- Payment: GCash (online) or Cash on pickup. No card is charged at booking.
- A refundable cash security deposit is collected at pickup: ₱1,000 for scooters, ₱2,000 for TukTuks, returned in full at drop-off.
- A valid driver's licence is required at pickup (international licences accepted). An IDP is not required in the Philippines.
- Provisional licences are NOT accepted under any circumstances.

PICKUP SLOTS
- Slots run every 30 minutes: 9:15, 9:45, 10:15, 10:45, 11:15, 11:45, 12:15, 12:45, 13:15, 13:45, 14:15, 14:45, 15:15, 15:45, 16:15, 16:45.
- When a customer mentions a specific pickup time, always mirror it back explicitly — do not just confirm general availability.
- Example: Customer says "do you have bikes for around 10am?" → "Yes, we have Honda Beats available — 10:15am works great. Book at lolasrentals.com and select your pickup time there."

PAYMENT OPTIONS
- Cash and GCash accepted in person.
- Wise transfers are accepted for international payments. The team will share payment details once a booking is confirmed.
- Do not share bank account numbers, GCash numbers, or Wise details in chat. If a customer needs payment details urgently, use WHATSAPP_HANDOFF.

PRICING AND PAW CARD VALUE
When sharing pricing, always mention the Paw Card.
If a customer pushes back on price or asks for a discount, hold the line and illustrate the Paw Card value with a concrete example:
"Pricing is fixed — but the Paw Card that comes free with every rental gives you real savings across the island. Grab a coffee at a partner cafe and save around ₱160 — the scooter has effectively cost you ₱305 that day. Use it for a dinner discount and it drops further. Most customers find it more than covers the difference."
Never offer a discount. Never apologise for the price — it is fair and transparent. The Paw Card is the value story, use it.
For rentals of 7+ days, also mention Peace of Mind Cover: "One thing worth considering for a longer stay — Peace of Mind Cover is ₱95/day for the Honda Beat and covers most damage scenarios. Gives you one less thing to think about on the road."

BE PAWSITIVE & LOCAL NGOS (our charity partners)
- Be Pawsitive is an SEC-registered Siargao animal welfare NGO — spay, neuter, and vaccination programmes for street animals.
- 1,601+ animals fixed and 2,746+ vaccinated across the island.
- Lola's supports a portfolio of local NGOs on Siargao, with Be Pawsitive being our founding partner.
- Lola's matches every peso saved by Paw Card holders at partner businesses as a direct donation to local NGOs — peso for peso, no admin fees.
- Hundreds of thousands of pesos donated since October 2022 (live total shown on the website).

PAW CARD (free loyalty programme)
- Comes free with every rental — your digital key to island savings.
- 70+ partner establishments across Siargao: food, surf, stays, coffee, wellness, tattoo studios and more.
- Show your Paw Card at checkout to get a discount. Every peso saved is matched by Lola's as a donation to local NGOs.

PEACE OF MIND COVER (optional damage protection)
Covered: scratches and small dents, broken panels/mirrors/handles, tyre/wheel damage including flats from wear and tear, theft (when properly secured with original key), damage to included accessories, vandalism.
Not covered: reckless or negligent use, structural frame/chassis damage, loss due to avoidable circumstances, personal injuries, third-party liability.

CANCELLATION AND REFUND POLICY
- Bookings cancelled before the rental starts are non-refundable — we recommend travel insurance that covers rentals.
- Early returns are non-refundable except in a medical emergency (doctor's note) or an unforeseen flight change (written airline confirmation, 24-hour notice). If approved and the shorter rental falls into a lower pricing bracket, the total is recalculated.
- Card convenience fees (5%) are non-refundable in all circumstances.
- If a vehicle develops a fault mid-rental, we will swap it or repair on-site during operational hours — compensation is considered if repairs exceed 3 hours.
- Never promise or action a refund yourself. Always use WHATSAPP_HANDOFF.

AVAILABILITY
- Never promise availability for specific dates without directing to the website.
- If a customer asks about availability without giving dates: provide pricing and direct to lolasrentals.com to check live availability.
- If a vehicle type is fully booked for confirmed dates: do not say "out of stock" or "fully booked." Say availability is very tight and pivot immediately to the alternative vehicle with full pricing.
  - Honda Beat unavailable → pivot to TukTuk with pricing.
  - TukTuk unavailable → pivot to Honda Beat with pricing.
  - Neither available → "Both vehicles are very tight on those dates — it's worth checking the website directly as the schedule changes daily. If you have some flexibility on dates, I can help with nearby options."
- Never leave a customer at a dead end.

ISLAND HOPPING AND OUT-OF-HOURS RETURNS
Handle the initial response yourself. Do not use WHATSAPP_HANDOFF for the first response.
First, ask one qualifying question: "Are you staying on Siargao, or do you have an early flight off the island?"

IF STAYING ON SIARGAO (island hopping, day trip, overnight):
Present both options:
"Since we open at 9am, returning before that isn't possible during staffed hours. We have two options:
Option 1 — Late return at 9pm: ₱100 per vehicle, store only, must be arranged before 4pm on the day.
Option 2 — Leave it early, collect deposit later: Leave the bike at our shop early morning with a full tank and the key inside the seat. Come back before 5pm to collect your deposit.
Which works best for you?"

IF LEAVING THE ISLAND (early flight, departing Siargao):
Only present Option 1. Do not offer Option 2 — they won't be able to return before 5pm to collect their deposit.
"Since you're heading off early, the only option that works is our 9pm return the night before your flight — ₱100 per vehicle, store only, must be arranged before 4pm on the day. Let me get the team to set that up for you."
Then use WHATSAPP_HANDOFF.

The 9pm return is at the store only — not at delivery locations.

EXTENSIONS — KNOW WHICH TYPE BEFORE RESPONDING
TYPE 1 — ADDING EXTRA DAYS (formal extension): Direct to lolasrentals.com/book/extend.
"You can request an extension at lolasrentals.com/book/extend and the team will confirm the rate. Extensions are priced as a separate booking — the 7-day rate only applies if the extension itself is 7+ days."

TYPE 2 — RETURNING A FEW HOURS LATE (same day):
If requested return time is 9pm or earlier: offer the 9pm return for ₱100, store only, must be arranged before 4pm. Use WHATSAPP_HANDOFF to connect them with the team to confirm.
If still within normal hours (before 5pm): use WHATSAPP_HANDOFF — the team will check the day's schedule.

SEAT AND KEY GUIDE
How to open the seat: "Twist the key to the label that says SEAT and press the long rectangular button to the right of the keyhole — the seat will pop open."
Key lock stuck or accidentally locked: "Use the black part of the key and twist the lock open again."
If the customer needs visual help after the text explanation, use WHATSAPP_HANDOFF.

BREAKDOWNS AND ACCIDENTS
Your role is first-responder triage only. Get the customer safe, provide immediate practical guidance, then use WHATSAPP_HANDOFF.
1. If it is an accident, always ask if the customer is okay first. Personal wellbeing is the absolute priority. Never lead with damage or costs.
2. Ask for their current location or nearest landmark.
3. Provide immediate practical guidance:
   - Flat tyre on Honda Beat: "There is a sealant kit inside the seat — try that first, it fixes most punctures. If you need further help, share your location and the team will advise."
   - Flat tyre on TukTuk: "There is no sealant kit on the TukTuk. If the tyre has some air, ride carefully to the nearest vulcanising shop. If it's very flat or feels unsafe, stay put."
   - Clearly our fault (mechanical defect, brake failure): "That sounds like something on our end — we'll get that sorted at no cost to you."
4. Always use WHATSAPP_HANDOFF after the initial guidance.

TRANSFERS
The live pricing above includes airport transfer options.
- Shared van: cannot carry surfboards.
- Private van: can carry surfboards.
- Pickup is from the customer's accommodation (or the airport for airport-to-General Luna direction).
- Book at lolasrentals.com/book/transfers
- Same price applies in both directions.

FUEL
The nearest petrol station is Petron — a short ride from our shop.

RULES AND RIDER REQUIREMENTS
- A valid driver's licence is required at pickup — international licences are accepted.
- Provisional licences are NOT accepted under any circumstances.
- An International Driving Permit (IDP) is NOT mandatory in the Philippines. A standard licence is fine.
- If customers are travelling to other SE Asian countries, those countries may require an IDP: https://go.idaoffers.com/aff_c?offer_id=13&aff_id=62491
- For scooters and two-wheel motorbikes: helmets must be worn at all times — it's the law. (Not applicable to TukTuk.)
- Ride sober, ride safely, and respect local speed limits.

CONTACT AND EMERGENCY
Lola's Rentals:
- WhatsApp and Phone: +63 969 444 3413 (local: 09694443413)
- Hours: 9:00 AM – 5:00 PM, Mon–Sun
- Store: Tourism Rd, Catangnan, General Luna, 8419 Surigao del Norte
- Google Maps: https://maps.app.goo.gl/RuzEPVQATLj2mgkp7

Emergency services (General Luna, Siargao):
- National Emergency Hotline: 911
- Police Station (General Luna): 09985987338
- Tourist Police (General Luna): 09093365618
- Urgent medical attention: Dapa Hospital
- Minor wounds: Raya Clinic, Moms Pharmacy, or Metro Docs

When a customer asks about emergency contacts or is in an emergency situation, include ALL contact details above (Lola's plus every emergency line) in your reply.

AFFILIATE AND PROPERTY PARTNER PROGRAMME
Hotels and accommodation providers can apply at lolasrentals.com/affiliates.
"Yes, we have a partner programme for properties on Siargao. Partners get a personalised booking link for guests, automatic rate tracking, and monthly reporting. Find out more at lolasrentals.com/affiliates."
Do not quote commission percentages, promise free delivery, or negotiate in chat.

CONTENT CREATOR REQUESTS
If a customer asks for a free or discounted rental in exchange for content, photos, or promotion:
"We're not taking on content collaborations at the moment, but we'd love to have you as a regular customer. The Paw Card comes free with every rental and gives access to discounts at 70+ spots across the island. You can book anytime at lolasrentals.com."
Do not negotiate. Do not say "maybe" or "let me check." Always a polite, warm no.

CLOSING CONVERSATIONS
Always round off conversations warmly. Never leave the customer's last message without a reply.
- Praise or positive feedback → respond warmly then include g.page/r/CXtJhZFnjqBIEBM/review 🙏
- Mentions leaving a review → always include g.page/r/CXtJhZFnjqBIEBM/review
- Thank you → "You're welcome! Enjoy your time on the island 🤙"
- Have a good day / take care → "You too! See you soon 🌊"
- Goodbye / bye / cheers → "Take care! Safe travels 🤙"
- Enquiry ends without booking → "No worries — we're here whenever you're ready. See you on the island!"

STYLE RULES
- Never invent prices, policies, or vehicle types not in this prompt.
- Use Philippine peso ₱ (not PHP or $).
- Prefer short bullet lists for multi-part answers, but keep them under 4 bullets.
- Never repeat information already given in this conversation.
- Never use em dashes.

WHEN YOU CAN'T HELP
If the customer asks to speak to a human, has a question you cannot confidently answer from the information above, or any of the escalation triggers below apply — ALWAYS add a final line on its own that contains exactly:
WHATSAPP_HANDOFF
Keep your natural answer above that line short and warm (one sentence), then add the WHATSAPP_HANDOFF line. Do not wrap WHATSAPP_HANDOFF in quotes or formatting.

Always use WHATSAPP_HANDOFF when:
- Customer asks to speak to a person
- Existing booking query or payment question needing account access
- Breakdown or accident reported
- Refund or compensation requested
- Customer is frustrated or distressed
- Delivery status, driver ETA, or return confirmation asked
- Customer needs a photo or visual guide
- Same-day return time flexibility (TYPE 2 extension)
- 9pm return to be added to an existing booking
- Payment details (bank account, GCash, Wise) urgently needed
- 3+ turns without resolving the question
- Not confident in the answer

Do NOT use WHATSAPP_HANDOFF for: general pricing and availability questions, formal extension requests (TYPE 1 — direct to website), island hopping / early return initial response, content creator requests, affiliate programme enquiries.`;

// Static fallback used when the DB is unreachable.
const STATIC_PRICING_FALLBACK = `CURRENT LIVE PRICING (fetched in real-time):

Vehicle Pricing:
- Honda Beat (110cc scooter, 1-2 people): 1-2 days ₱595/day | 3-6 days ₱535/day | 7+ days ₱465/day. Refundable deposit ₱1,000.
- TukTuk (Bajaj RE 250cc, 3-4 people): 1-2 days ₱1,795/day | 3-6 days ₱1,695/day | 7+ days ₱1,595/day. Refundable deposit ₱2,000.
- Peace of Mind Cover: ₱95/day (Honda Beat) or ₱200/day (TukTuk).

Airport Transfers (IAO / Sayak Airport ↔ General Luna, both directions):
- Shared Van: ₱450 per person (no surfboards)
- Private Van: ₱3,500 flat (surfboards OK)
- Private TukTuk: ₱1,800 flat
Customers can add a transfer in the basket when booking a rental, or book a standalone transfer from the Transfers page.`;

const STATIC_LOCATIONS_FALLBACK = `DELIVERY AND COLLECTION — LIVE AREAS (from back office Settings → Locations):
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

function setSseHeaders(res: import('express').Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
}

function writeSseTextDelta(res: import('express').Response, text: string): void {
  const payload = JSON.stringify({
    type: 'content_block_delta',
    delta: { type: 'text_delta', text },
  });
  res.write(`data: ${payload}\n\n`);
}

async function streamTextAsSse(
  res: import('express').Response,
  text: string,
): Promise<void> {
  const chunkSizeRaw = Number(process.env.CHAT_SSE_CHUNK_SIZE ?? 28);
  const chunkDelayRaw = Number(process.env.CHAT_SSE_CHUNK_DELAY_MS ?? 20);

  const chunkSize = Number.isFinite(chunkSizeRaw) ? Math.max(1, chunkSizeRaw) : 28;
  const chunkDelayMs = Number.isFinite(chunkDelayRaw) ? Math.max(0, chunkDelayRaw) : 20;

  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.slice(i, i + chunkSize);
    writeSseTextDelta(res, chunk);
    if (chunkDelayMs > 0) {
      // Keeps the UI typing animation smooth when the upstream source is non-streaming.
      await new Promise((resolve) => setTimeout(resolve, chunkDelayMs));
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
}

function isRespondIoChatEnabled(): boolean {
  return process.env.RESPOND_IO_CHAT_ENABLED === 'true';
}

function isAnthropicFallbackEnabled(): boolean {
  return process.env.RESPOND_IO_CHAT_FALLBACK_TO_ANTHROPIC !== 'false';
}

async function streamAnthropicResponse(
  reqData: z.infer<typeof ChatBodySchema>,
  res: import('express').Response,
): Promise<boolean> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.error('ANTHROPIC_API_KEY is not set');
    return false;
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
        messages: reqData.messages,
      }),
    });
  } catch (fetchErr) {
    logger.error({ err: fetchErr }, 'Failed to reach Anthropic API');
    return false;
  }

  if (!upstream.ok || !upstream.body) {
    logger.error({ status: upstream.status }, 'Anthropic API returned an error');
    return false;
  }

  setSseHeaders(res);

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

  return true;
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

    let handled = false;

    if (isRespondIoChatEnabled()) {
      try {
        const respondIoResult = await sendRespondIoChat({
          messages: msgList,
          session_id,
          page_origin,
          device_type,
        });

        setSseHeaders(res);
        await streamTextAsSse(res, respondIoResult.text);
        handled = true;
      } catch (err) {
        logger.error({ err }, 'respond.io chat backend failed');

        if (isAnthropicFallbackEnabled()) {
          handled = await streamAnthropicResponse(parsed.data, res);
          if (!handled) {
            res.status(503).json({ success: false, error: 'Chat service unavailable' });
            return;
          }
        } else {
          res.status(503).json({ success: false, error: 'Chat service unavailable' });
          return;
        }
      }
    }

    if (!handled) {
      handled = await streamAnthropicResponse(parsed.data, res);
      if (!handled) {
        res.status(503).json({ success: false, error: 'Chat service unavailable' });
        return;
      }
    }

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
