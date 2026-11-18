import type { Addon, AvailableModel, BookingPort, ConfigRepository, HoldRow, Location } from '@lolas/domain';
import { hasBookingLeadTime, resolveSourceFromStore } from '@lolas/shared';
import { supabase } from '../../adapters/supabase/client.js';
import { checkAvailability } from '../booking/check-availability.js';
import { computeQuote } from '../booking/compute-quote.js';
import { createHold } from '../booking/create-hold.js';
import {
  assertSurfRacksAvailable,
  countRackAddons,
  getSurfRackAvailability,
} from '../surf-racks/get-surf-rack-availability.js';
import { applyPartnerBenefit, lookupActivePartnerBySlug, type PartnerBenefitRow } from '../../lib/partner-benefit.js';
import { uniqueWalkInReference } from '../../lib/walk-in-reference.js';
import { publicWebOriginFromEnv } from '../../lib/public-web-url.js';
import { sendTelegramAlert, getTelegramChatId } from '../../lib/telegram.js';
import { sendEmail, walkInReservationConfirmationHtml, escapeHtml } from '../../services/email.js';
import { sendBookingConfirmationWhatsApp } from '../../services/booking-confirmation-whatsapp.js';
import { formatManilaDateTime } from '../../utils/manila-date.js';
import {
  MS_PER_DAY,
  counterWindow,
  isSlot,
  nextSlotFrom,
  windowFrom,
  type CounterWindow,
} from './counter-slots.js';

/** Fully booked models get one follow-up availability check each; this caps the extra queries. */
const MAX_NEXT_FREE_CHECKS = 8;

export interface CounterDeps {
  bookingPort: BookingPort;
  configRepo: ConfigRepository;
}

/**
 * Who is booking and where the vehicle changes hands. Our own counter hands over at the
 * store, starting now; a partner kiosk delivers to the hotel's area at a chosen slot.
 */
export interface CounterContext {
  storeId: string;
  mode: 'now' | 'scheduled';
  partner: PartnerBenefitRow | null;
  handoverLocation: Location | null;
  /** Free-text address for the handover (the hotel's name on partner kiosks). */
  handoverAddress: string | null;
  /** Our counter offers collection from an area; partner kiosks always collect from the hotel. */
  offerCollection: boolean;
  alertTitle: string;
}

export class CounterError extends Error {
  constructor(message: string, readonly status: number, readonly code = 'REQUEST_FAILED') {
    super(message);
  }
}

const vehicleTaken = () => new CounterError(
  'Sorry, that vehicle was just taken. Please choose another one.', 409, 'VEHICLE_UNAVAILABLE',
);

export function storeHandoverLocation(locations: Location[]): Location | null {
  const active = locations.filter((l) => l.isActive !== false);
  const store = active.find((l) => (l.locationType === 'store' || l.locationType === null)
    && Number(l.deliveryCost) === 0 && Number(l.collectionCost) === 0);
  return store ?? active[0] ?? null;
}

export async function staffCounterContext(configRepo: ConfigRepository, storeId: string): Promise<CounterContext> {
  const locations = (await configRepo.getLocations(storeId)) as Location[];
  return {
    storeId,
    mode: 'now',
    partner: null,
    handoverLocation: storeHandoverLocation(locations),
    handoverAddress: null,
    offerCollection: true,
    alertTitle: 'Counter booking (in store)',
  };
}

/**
 * A partner's front-desk tablet: the guest picks a start slot, we deliver to and collect
 * from the hotel's area, and the partner's deal (discount, free delivery) applies.
 */
export async function partnerKioskContext(
  configRepo: ConfigRepository,
  session: { storeId: string; partnerSlug: string; partnerName: string; kioskLocationId: number | null },
): Promise<CounterContext> {
  const [partner, locations] = await Promise.all([
    lookupActivePartnerBySlug(session.partnerSlug),
    configRepo.getLocations(session.storeId) as Promise<Location[]>,
  ]);
  if (!partner) throw new CounterError('This partner is no longer active.', 401, 'KIOSK_SIGNED_OUT');
  const handoverLocation = session.kioskLocationId == null
    ? null
    : locations.find((l) => Number(l.id) === session.kioskLocationId && l.isActive !== false) ?? null;
  if (!handoverLocation) {
    throw new CounterError(
      "This tablet isn't set up for delivery yet. Please ask Lola's Rentals to set your delivery area.",
      409,
      'KIOSK_NOT_SET_UP',
    );
  }
  return {
    storeId: session.storeId,
    mode: 'scheduled',
    partner,
    handoverLocation,
    handoverAddress: session.partnerName,
    offerCollection: false,
    alertTitle: `Partner tablet · ${session.partnerName}`,
  };
}

/** Resolves the rental window: now for our counter, or a validated future slot for partner kiosks. */
export function resolveWindow(ctx: CounterContext, days: number, pickupDatetime?: string | null, nowMs = Date.now()): CounterWindow {
  if (ctx.mode === 'now') return counterWindow(days, nowMs);
  const pickupMs = pickupDatetime ? Date.parse(pickupDatetime) : NaN;
  if (!Number.isFinite(pickupMs) || !isSlot(pickupMs)) {
    throw new CounterError('Please choose one of our pickup times.', 422);
  }
  const window = windowFrom(pickupMs, days);
  if (!hasBookingLeadTime(window.pickupDatetime, nowMs)) {
    throw new CounterError('That time has passed. Please choose a later pickup time.', 422);
  }
  return window;
}

interface Pricing {
  dailyRate: number | null;
  rentalSubtotal: number | null;
  rentalDiscount: number;
  deliveryFee: number;
  total: number | null;
  securityDeposit: number | null;
}

async function priceModel(
  deps: CounterDeps,
  ctx: CounterContext,
  modelId: string,
  window: CounterWindow,
  options: { addonIds?: number[]; dropoffLocationId?: number | null } = {},
) {
  const pickupLocationId = ctx.handoverLocation ? Number(ctx.handoverLocation.id) : null;
  if (pickupLocationId === null) return null;
  const dropoffLocationId = options.dropoffLocationId ?? pickupLocationId;
  const quote = await computeQuote(
    { configRepo: deps.configRepo },
    { storeId: ctx.storeId, vehicleModelId: modelId, ...window, pickupLocationId, dropoffLocationId, addonIds: options.addonIds },
  );
  const benefit = ctx.partner
    ? applyPartnerBenefit({
        partner: ctx.partner,
        rentalSubtotal: quote.rentalSubtotal,
        pickupFee: quote.pickupFee,
        dropoffFee: quote.dropoffFee,
        advanceDaysFromNow: (Date.parse(window.pickupDatetime) - Date.now()) / MS_PER_DAY,
        vehicleModelId: modelId,
        pickupLocationId,
        dropoffLocationId,
      })
    : { rentalSubtotal: quote.rentalSubtotal, pickupFee: quote.pickupFee, dropoffFee: quote.dropoffFee, rentalDiscount: 0 };
  return {
    quote,
    pickupLocationId,
    dropoffLocationId,
    rentalSubtotal: benefit.rentalSubtotal,
    rentalDiscount: benefit.rentalDiscount,
    pickupFee: benefit.pickupFee,
    dropoffFee: benefit.dropoffFee,
    total: benefit.rentalSubtotal + benefit.pickupFee + benefit.dropoffFee + quote.addonsTotal,
  };
}

async function basePricing(deps: CounterDeps, ctx: CounterContext, modelId: string, window: CounterWindow): Promise<Pricing> {
  const priced = await priceModel(deps, ctx, modelId, window).catch(() => null);
  if (!priced) {
    return { dailyRate: null, rentalSubtotal: null, rentalDiscount: 0, deliveryFee: 0, total: null, securityDeposit: null };
  }
  return {
    dailyRate: priced.quote.dailyRate,
    rentalSubtotal: priced.rentalSubtotal,
    rentalDiscount: priced.rentalDiscount,
    deliveryFee: priced.pickupFee + priced.dropoffFee,
    total: priced.total,
    securityDeposit: priced.quote.securityDeposit,
  };
}

function availability(deps: CounterDeps, ctx: CounterContext, window: CounterWindow, sessionToken?: string | null) {
  return checkAvailability({ bookingPort: deps.bookingPort }, {
    storeId: ctx.storeId,
    ...window,
    partnerRef: ctx.partner?.slug,
    excludeSessionToken: sessionToken ?? undefined,
  }) as Promise<AvailableModel[]>;
}

/**
 * For each fully booked model, the earliest slot from which it is free for the whole
 * requested length. Availability only gives a hint (when the blocking booking clears),
 * so each hint is re-checked for the full duration before it is shown.
 */
async function nextFreeStarts(
  deps: CounterDeps,
  ctx: CounterContext,
  days: number,
  fullyBooked: AvailableModel[],
): Promise<Map<string, string>> {
  const byStart = new Map<number, string[]>();
  for (const m of fullyBooked) {
    if (!m.nextAvailablePickup) continue;
    const startMs = nextSlotFrom(Date.parse(m.nextAvailablePickup));
    if (!Number.isFinite(startMs)) continue;
    byStart.set(startMs, [...(byStart.get(startMs) ?? []), m.modelId]);
  }
  const result = new Map<string, string>();
  const checks = [...byStart.entries()].slice(0, MAX_NEXT_FREE_CHECKS);
  await Promise.all(checks.map(async ([startMs, modelIds]) => {
    const later = await availability(deps, ctx, windowFrom(startMs, days)).catch(() => [] as AvailableModel[]);
    for (const id of modelIds) {
      if ((later.find((l) => l.modelId === id)?.availableCount ?? 0) > 0) {
        result.set(id, new Date(startMs).toISOString());
      }
    }
  }));
  return result;
}

export async function listCounterOptions(
  deps: CounterDeps,
  ctx: CounterContext,
  input: { days: number; pickupDatetime?: string | null; sessionToken?: string | null },
) {
  const window = resolveWindow(ctx, input.days, input.pickupDatetime);
  const models = await availability(deps, ctx, window, input.sessionToken);
  const nextFree = await nextFreeStarts(deps, ctx, input.days, models.filter((m) => m.availableCount < 1));

  const options = await Promise.all(models.map(async (m) => ({
    modelId: m.modelId,
    modelName: m.modelName,
    availableCount: m.availableCount,
    nextFreePickup: m.availableCount > 0 ? null : nextFree.get(m.modelId) ?? null,
    ...(await basePricing(deps, ctx, m.modelId, window)),
  })));
  options.sort((a, b) => Number(b.availableCount > 0) - Number(a.availableCount > 0));

  return { storeId: ctx.storeId, rentalDays: input.days, ...window, models: options };
}

export type CounterAddonKind = 'peace_of_mind' | 'surf_rack' | 'bungee';

export interface CounterAddonOption {
  id: number;
  name: string;
  kind: CounterAddonKind;
  addonType: 'per_day' | 'one_time';
  unitPrice: number;
  total: number;
  soldOut: boolean;
}

export interface CollectionArea {
  id: number;
  name: string;
  fee: number;
}

function addonKind(addon: Addon): CounterAddonKind | null {
  const name = addon.name.toLowerCase();
  if (name.includes('peace') || name.includes('mind')) return 'peace_of_mind';
  if (addon.inventoryType === 'surf_rack' || /surf\s*rack/.test(name)) return 'surf_rack';
  if (name.includes('bungee') || name.includes('bingee')) return 'bungee';
  return null;
}

const KIND_ORDER: CounterAddonKind[] = ['peace_of_mind', 'surf_rack', 'bungee'];

export async function getCounterExtras(
  deps: CounterDeps,
  ctx: CounterContext,
  input: { modelId: string; modelName: string; window: CounterWindow; sessionToken?: string | null },
): Promise<{ addons: CounterAddonOption[]; collectionAreas: CollectionArea[] }> {
  const days = Math.max(1, Math.round((Date.parse(input.window.dropoffDatetime) - Date.parse(input.window.pickupDatetime)) / MS_PER_DAY));
  const isTuktuk = input.modelName.toLowerCase().includes('tuk');
  const [addons, locations] = await Promise.all([
    deps.configRepo.getAddons(ctx.storeId) as Promise<Addon[]>,
    ctx.offerCollection ? (deps.configRepo.getLocations(ctx.storeId) as Promise<Location[]>) : Promise.resolve([] as Location[]),
  ]);

  const picked = new Map<CounterAddonKind, Addon>();
  for (const addon of addons) {
    if (addon.isActive === false) continue;
    if (addon.applicableModelIds && addon.applicableModelIds.length > 0 && !addon.applicableModelIds.includes(input.modelId)) continue;
    const kind = addonKind(addon);
    if (!kind || picked.has(kind)) continue;
    if (kind === 'peace_of_mind' && addon.name.toLowerCase().includes('tuk') !== isTuktuk) continue;
    picked.set(kind, addon);
  }

  let rackSoldOut = false;
  if (picked.has('surf_rack')) {
    const racks = await getSurfRackAvailability(supabase, {
      storeId: ctx.storeId,
      ...input.window,
      vehicleModelId: input.modelId,
      excludeSessionToken: input.sessionToken ?? null,
    }).catch(() => null);
    rackSoldOut = Boolean(racks?.tracked && racks.soldOut);
  }

  const options = KIND_ORDER.flatMap((kind) => {
    const addon = picked.get(kind);
    if (!addon) return [];
    const unitPrice = addon.addonType === 'per_day' ? Number(addon.pricePerDay) : Number(addon.priceOneTime);
    return [{
      id: Number(addon.id),
      name: addon.name,
      kind,
      addonType: addon.addonType,
      unitPrice,
      total: addon.addonType === 'per_day' ? unitPrice * days : unitPrice,
      soldOut: kind === 'surf_rack' && rackSoldOut,
    }];
  });

  const collectionAreas = locations
    .filter((l) => l.isActive !== false && l.locationType !== 'store' && Number(l.collectionCost) > 0 && !/airport/i.test(l.name))
    .map((l) => ({ id: Number(l.id), name: l.name, fee: Number(l.collectionCost) }))
    .sort((a, b) => a.fee - b.fee || a.name.localeCompare(b.name));

  return { addons: options, collectionAreas };
}

async function modelName(deps: CounterDeps, modelId: string): Promise<string> {
  const vm = await deps.configRepo.getVehicleModelById(modelId).catch(() => null);
  return (vm as { name?: string } | null)?.name ?? modelId;
}

export async function counterExtras(
  deps: CounterDeps,
  ctx: CounterContext,
  input: { modelId: string; days: number; pickupDatetime?: string | null; sessionToken?: string | null },
) {
  const window = resolveWindow(ctx, input.days, input.pickupDatetime);
  return getCounterExtras(deps, ctx, {
    modelId: input.modelId,
    modelName: await modelName(deps, input.modelId),
    window,
    sessionToken: input.sessionToken,
  });
}

/** Holds the chosen vehicle for 10 minutes while the customer finishes, like the website basket. */
export async function createCounterHold(
  deps: CounterDeps,
  ctx: CounterContext,
  input: { modelId: string; days: number; pickupDatetime?: string | null; sessionToken: string },
): Promise<HoldRow> {
  const window = resolveWindow(ctx, input.days, input.pickupDatetime);
  try {
    return await createHold({ bookingPort: deps.bookingPort }, {
      vehicleModelId: input.modelId,
      storeId: ctx.storeId,
      ...window,
      sessionToken: input.sessionToken,
      partnerRef: ctx.partner?.slug,
    });
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 409 || /ALLOCATION_CONFLICT|VEHICLE_UNAVAILABLE/.test((err as Error).message)) {
      throw vehicleTaken();
    }
    throw err;
  }
}

export async function releaseCounterHold(deps: CounterDeps, holdId: string, sessionToken: string): Promise<void> {
  await deps.bookingPort.deleteHold(holdId, sessionToken).catch(() => false);
}

export interface CounterBookingInput {
  vehicleModelId: string;
  days: number;
  pickupDatetime?: string | null;
  customerName: string;
  customerMobile: string;
  customerEmail: string;
  addonIds?: number[];
  collectionLocationId?: number | null;
  stayingAt?: string | null;
  holdId?: string | null;
  sessionToken?: string | null;
}

/** The customer's own hold, if it still matches what they are booking. */
async function findOwnHold(deps: CounterDeps, ctx: CounterContext, input: CounterBookingInput): Promise<HoldRow | null> {
  if (!input.holdId || !input.sessionToken) return null;
  const holds = await deps.bookingPort.findActiveHoldsBySession(input.sessionToken).catch(() => [] as HoldRow[]);
  const hold = holds.find((h) => h.id === input.holdId);
  if (!hold || hold.vehicleModelId !== input.vehicleModelId || hold.storeId !== ctx.storeId) return null;
  const pickupMs = Date.parse(hold.pickupDatetime);
  if (Math.round((Date.parse(hold.dropoffDatetime) - pickupMs) / MS_PER_DAY) !== input.days) return null;
  if (ctx.mode === 'scheduled' && pickupMs !== Date.parse(input.pickupDatetime ?? '')) return null;
  return hold;
}

export async function createCounterBooking(deps: CounterDeps, ctx: CounterContext, input: CounterBookingInput) {
  const hold = await findOwnHold(deps, ctx, input);
  const window = hold
    ? { pickupDatetime: new Date(hold.pickupDatetime).toISOString(), dropoffDatetime: new Date(hold.dropoffDatetime).toISOString() }
    : resolveWindow(ctx, input.days, input.pickupDatetime);
  const sessionToken = hold ? input.sessionToken! : null;

  const available = await availability(deps, ctx, window, sessionToken);
  const model = available.find((m) => m.modelId === input.vehicleModelId);
  if (!model || model.availableCount < 1) throw vehicleTaken();

  const extras = await getCounterExtras(deps, ctx, {
    modelId: input.vehicleModelId, modelName: model.modelName, window, sessionToken,
  });
  const addonIds = [...new Set(input.addonIds ?? [])];
  const chosenAddons = addonIds.map((id) => extras.addons.find((a) => a.id === id));
  if (chosenAddons.some((a) => !a)) throw new CounterError('One of those extras is not available for this vehicle.', 422);
  if (chosenAddons.some((a) => a!.soldOut)) throw new CounterError('Surf racks are fully booked for these dates. Please remove the surf rack.', 409);
  if (addonIds.length > 0) {
    const rackIds = extras.addons.filter((a) => a.kind === 'surf_rack').map((a) => a.id);
    await assertSurfRacksAvailable(supabase, {
      storeId: ctx.storeId, ...window, vehicleModelId: input.vehicleModelId,
      excludeSessionToken: sessionToken, requested: countRackAddons(addonIds, rackIds),
    });
  }
  const collection = input.collectionLocationId
    ? extras.collectionAreas.find((a) => a.id === input.collectionLocationId)
    : null;
  if (input.collectionLocationId && !collection) throw new CounterError('We do not collect from that area.', 422);

  const priced = await priceModel(deps, ctx, input.vehicleModelId, window, {
    addonIds: addonIds.length > 0 ? addonIds : undefined,
    dropoffLocationId: collection?.id ?? null,
  }).catch((err) => {
    if ((err as { statusCode?: number }).statusCode === 422) throw new CounterError((err as Error).message, 422);
    return null;
  });

  const stayingAt = input.stayingAt?.trim() || null;
  const source = resolveSourceFromStore(ctx.storeId);
  const orderReference = await uniqueWalkInReference(source);
  const handoverId = ctx.handoverLocation ? Number(ctx.handoverLocation.id) : null;
  const { error } = await supabase.from('orders_raw').insert({
    source,
    booking_channel: ctx.partner ? 'direct' : 'walk_in',
    via_counter: true,
    status: 'unprocessed',
    store_id: ctx.storeId,
    partner_ref: ctx.partner?.slug ?? null,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_mobile: input.customerMobile,
    vehicle_model_id: input.vehicleModelId,
    pickup_datetime: window.pickupDatetime,
    dropoff_datetime: window.dropoffDatetime,
    pickup_location_id: handoverId,
    dropoff_location_id: collection?.id ?? handoverId,
    pickup_location_address: ctx.handoverAddress,
    dropoff_location_address: collection ? stayingAt : ctx.handoverAddress,
    addon_ids: addonIds.length > 0 ? addonIds : null,
    web_quote_raw: priced?.total ?? null,
    rental_value_raw: priced?.rentalSubtotal ?? null,
    order_reference: orderReference,
    booking_hold_id: hold?.id ?? null,
    booking_session_token: sessionToken,
  });
  if (error) {
    if (/ALLOCATION_CONFLICT|VEHICLE_UNAVAILABLE/.test(error.message)) throw vehicleTaken();
    throw new Error(error.message);
  }
  if (hold) await releaseCounterHold(deps, hold.id, sessionToken!);

  notifyCounterBooking(ctx, {
    orderReference,
    input,
    vehicleName: model.modelName,
    window,
    pickupLocation: ctx.handoverLocation?.name ?? 'Store',
    dropoffLocation: collection?.name ?? ctx.handoverLocation?.name ?? 'Store',
    stayingAt: collection ? stayingAt : null,
    priced,
  });

  return { orderReference, ...window };
}

function notifyCounterBooking(
  ctx: CounterContext,
  b: {
    orderReference: string;
    input: CounterBookingInput;
    vehicleName: string;
    window: CounterWindow;
    pickupLocation: string;
    dropoffLocation: string;
    stayingAt: string | null;
    priced: Awaited<ReturnType<typeof priceModel>> | null;
  },
) {
  const pickup = formatManilaDateTime(b.window.pickupDatetime);
  const dropoff = formatManilaDateTime(b.window.dropoffDatetime);
  const addons = (b.priced?.quote.addons ?? []).map((a) => ({ name: a.name, price: a.total }));
  const where = (name: string, address: string | null) => (address ? `${name} — ${address}` : name);
  const pickupWhere = where(b.pickupLocation, ctx.handoverAddress);
  const dropoffWhere = where(b.dropoffLocation, b.stayingAt ?? (b.dropoffLocation === b.pickupLocation ? ctx.handoverAddress : null));

  void sendTelegramAlert(
    `📋 <b>${escapeHtml(ctx.alertTitle)}</b>\n` +
      `Reference: ${escapeHtml(b.orderReference)}\n` +
      `Customer: ${escapeHtml(b.input.customerName)} · ${escapeHtml(b.input.customerMobile)}\n` +
      `Vehicle: ${escapeHtml(b.vehicleName)}\n` +
      `Pickup: ${escapeHtml(pickup)} · ${escapeHtml(pickupWhere)}\n` +
      `Return: ${escapeHtml(dropoff)} · ${escapeHtml(dropoffWhere)}` +
      (addons.length > 0 ? `\nAdd-ons: ${addons.map((a) => `${escapeHtml(a.name)} (₱${a.price.toLocaleString('en-PH')})`).join(', ')}` : '') +
      (b.priced ? `\n💰 <b>Est. Total:</b> ₱${b.priced.total.toLocaleString('en-PH')}` : '') +
      `\nStore: ${escapeHtml(ctx.storeId)}`,
    getTelegramChatId('ops'),
  );

  void sendEmail({
    to: b.input.customerEmail,
    subject: `Reservation Confirmed — ${b.orderReference} | Lola's Rentals`,
    html: walkInReservationConfirmationHtml({
      customerName: b.input.customerName,
      orderReference: b.orderReference,
      vehicleName: b.vehicleName,
      pickupDatetime: pickup,
      dropoffDatetime: dropoff,
      pickupLocation: pickupWhere,
      dropoffLocation: dropoffWhere,
      rentalDays: b.priced?.quote.rentalDays,
      dailyRate: b.priced?.quote.dailyRate,
      rentalSubtotal: b.priced?.quote.rentalSubtotal,
      pickupFee: b.priced?.pickupFee,
      dropoffFee: b.priced?.dropoffFee,
      discount: b.priced?.rentalDiscount || undefined,
      estimatedTotal: b.priced?.total,
      depositAmount: undefined,
      depositMethod: undefined,
      whatsappNumber: process.env.WHATSAPP_NUMBER ?? '639694443413',
      addons,
    }),
  });

  sendBookingConfirmationWhatsApp({
    customerName: b.input.customerName,
    customerMobile: b.input.customerMobile,
    orderReference: b.orderReference,
    vehicleName: b.vehicleName,
    pickupDatetime: pickup,
    dropoffDatetime: dropoff,
    pickupLocation: pickupWhere,
    dropoffLocation: dropoffWhere,
    waiverUrl: `${publicWebOriginFromEnv(process.env.WEB_URL)}/waiver/${b.orderReference}`,
    source: ctx.partner ? 'partner-kiosk-confirmation' : 'counter-confirmation',
  });
}
