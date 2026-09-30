import { getSupabaseClient } from '../adapters/supabase/client.js';
import { formatManilaDate } from '../utils/manila-date.js';

export interface PartnerCommissionBooking {
  id: string;
  orderReference: string | null;
  customerName: string | null;
  vehicleModelId: string | null;
  pickupDatetime: string | null;
  dropoffDatetime: string | null;
  rentalValue: number;
  bookingValue: number;
  commissionBase: number | null;
  commissionType: 'fixed' | 'percentage' | null;
  commissionValue: number | null;
  status: string;
  cancelledReason: string | null;
  cancelledAt: string | null;
  bookedAt: string;
  advanceDays: number | null;
  commissionable: boolean;
  /** Commission attributable to THIS report month only. For a booking whose
   * nights fall entirely within the month this is the full amount, same as
   * before. For a booking that spans a month boundary (an extension, or a
   * long original stay) this is prorated by the share of nights that
   * actually fall in this month — see `periodNote`. */
  commissionAmount: number;
  isExtended: boolean;
  extendedDropoffDatetime: string | null;
  pendingCommissionAmount: number;
  /** True when this booking was created in an earlier month and is only
   * appearing in this report because some of its rental nights — from an
   * extension, or a long original stay — land in this calendar month. Such
   * rows do NOT count toward totalBookings/commissionableBookings (the
   * booking was already counted in its origin month) but DO contribute
   * their share of commissionAmount/pendingCommissionAmount to this month's
   * totals, and their nights count toward this month's vehicle-days. */
  isCarryover: boolean;
  /** Human-readable note shown when a booking's nights are split across two
   * calendar months, e.g. "Sep 20\u201330 of 18 nights \u2014 remainder continues
   * into October" or "Continued from Sep 20 booking \u2014 Oct 1\u20138 of 18
   * nights". Null when the whole stay falls within a single month. */
  periodNote: string | null;
}

export interface PartnerCommissionStats {
  totalBookings: number;
  commissionableBookings: number;
  totalCommission: number;
  totalPendingCommission: number;
  totalVehiclesRented: number;
  averageVehiclesPerDay: number;
  bookings: PartnerCommissionBooking[];
}

export interface PartnerCommissionDueRow {
  partnerId: string;
  partnerName: string;
  contactName: string | null;
  contactEmail: string | null;
  totalBookings: number;
  commissionableBookings: number;
  amountDue: number;
  pendingAmount: number;
}

export interface PartnerCommissionsDue {
  month: string;
  totalDue: number;
  totalPending: number;
  partnersDue: number;
  partners: PartnerCommissionDueRow[];
}

interface PartnerTerms {
  id: string;
  slug: string;
  store_id: string;
  advance_booking_days: number;
  commission_type: 'fixed' | 'percentage';
  commission_value: number;
  commission_includes_extensions: boolean;
}

interface VehicleCommissionTerms {
  vehicle_model_id: string;
  deal_type: string;
  advance_booking_days: number | null;
  commission_type: 'fixed' | 'percentage' | null;
  commission_value: number | null;
  commission_includes_extensions: boolean;
}

interface RawBookingRow {
  id: string;
  order_reference: string | null;
  customer_name: string | null;
  vehicle_model_id: string | null;
  pickup_datetime: string | null;
  dropoff_datetime: string | null;
  rental_value_raw: number | null;
  web_quote_raw: number | null;
  status: string;
  cancelled_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
}

const RAW_BOOKING_SELECT =
  'id, order_reference, customer_name, vehicle_model_id, pickup_datetime, dropoff_datetime, rental_value_raw, web_quote_raw, status, cancelled_reason, cancelled_at, created_at';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthBounds(month?: string): { from?: string; to?: string } {
  if (!month) return {};
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return {};
  return {
    from: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    to: new Date(Date.UTC(y, m, 1)).toISOString(),
  };
}

// Calendar-day gap (Asia/Manila) between when a booking was created and its
// pickup date. Using calendar dates instead of raw millisecond diffs avoids
// penalising bookings whose orders_raw row was logged a few minutes after the
// scheduled pickup time (common for walk-in / on-site delivery hand-offs) —
// those should still count as "booked same day" (0 days advance), not a
// small negative number that fails an advance_booking_days >= 0 threshold.
function calendarAdvanceDays(pickupIso: string, createdIso: string): number {
  const pickupDate = new Date(formatManilaDate(new Date(pickupIso)) + 'T00:00:00Z').getTime();
  const createdDate = new Date(formatManilaDate(new Date(createdIso)) + 'T00:00:00Z').getTime();
  return Math.round((pickupDate - createdDate) / 86_400_000);
}

function daysInReportMonth(month?: string): number {
  const source = month && /^\d{4}-\d{2}$/.test(month)
    ? month
    : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 7);
  const [y, m] = source.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function fmtManilaShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
}

function fmtMonthName(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'long' });
}

export async function getPartnerCommissionsDue(storeId: string | undefined, month: string): Promise<PartnerCommissionsDue> {
  const sb = getSupabaseClient();
  let query = sb
    .from('accommodation_partners')
    .select('id, name, contact_name, contact_email')
    .eq('active', true)
    .eq('status', 'active')
    .in('deal_type', ['commission', 'combined', 'commission_delivery'])
    .order('name', { ascending: true });

  if (storeId) query = query.eq('store_id', storeId);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch commission partners: ${error.message}`);

  const partners = (data ?? []) as Array<{
    id: string;
    name: string;
    contact_name: string | null;
    contact_email: string | null;
  }>;

  const rows = await Promise.all(partners.map(async (partner) => {
    const stats = await getPartnerCommissionStats(partner.id, month);
    return {
      partnerId: partner.id,
      partnerName: partner.name,
      contactName: partner.contact_name,
      contactEmail: partner.contact_email,
      totalBookings: stats.totalBookings,
      commissionableBookings: stats.commissionableBookings,
      amountDue: stats.totalCommission,
      pendingAmount: stats.totalPendingCommission,
    } satisfies PartnerCommissionDueRow;
  }));

  const visibleRows = rows.filter((row) => row.amountDue > 0 || row.pendingAmount > 0);
  return {
    month,
    totalDue: roundMoney(visibleRows.reduce((sum, row) => sum + row.amountDue, 0)),
    totalPending: roundMoney(visibleRows.reduce((sum, row) => sum + row.pendingAmount, 0)),
    partnersDue: visibleRows.filter((row) => row.amountDue > 0).length,
    partners: visibleRows,
  };
}

export async function getPartnerCommissionStats(partnerId: string, month?: string): Promise<PartnerCommissionStats> {
  const sb = getSupabaseClient();
  const { data: partner, error: partnerErr } = await sb
    .from('accommodation_partners')
    .select('id, slug, store_id, advance_booking_days, commission_type, commission_value, commission_includes_extensions')
    .eq('id', partnerId)
    .single();

  if (partnerErr || !partner) {
    const err = new Error('Partner not found');
    (err as Error & { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const p = partner as PartnerTerms;
  const bounds = monthBounds(month);

  const { data: vehicleTermsRows, error: vehicleTermsErr } = await sb
    .from('partner_vehicle_terms')
    .select('vehicle_model_id, deal_type, advance_booking_days, commission_type, commission_value, commission_includes_extensions')
    .eq('partner_id', p.id);

  if (vehicleTermsErr) throw new Error(`Failed to fetch partner vehicle terms: ${vehicleTermsErr.message}`);

  const vehicleTermsByModel = new Map(
    ((vehicleTermsRows ?? []) as VehicleCommissionTerms[]).map((term) => [term.vehicle_model_id, term]),
  );

  // ── Primary bookings: created within the report month (existing behaviour). ──
  // These drive totalBookings / commissionableBookings — a booking is only
  // ever "made" once, in the month it was actually created.
  let rawQuery = sb
    .from('orders_raw')
    .select(RAW_BOOKING_SELECT)
    .eq('store_id', p.store_id)
    .eq('partner_ref', p.slug)
    .order('created_at', { ascending: false });

  if (bounds.from && bounds.to) rawQuery = rawQuery.gte('created_at', bounds.from).lt('created_at', bounds.to);

  const { data: primaryRows, error: rawErr } = await rawQuery;
  if (rawErr) throw new Error(`Failed to fetch partner bookings: ${rawErr.message}`);
  const primaryRawRows = (primaryRows ?? []) as RawBookingRow[];

  const anyVehicleOverrideIncludesExtensions = Array.from(vehicleTermsByModel.values())
    .some((term) => term.commission_includes_extensions);
  const extensionsMatterForCommission = p.commission_includes_extensions || anyVehicleOverrideIncludesExtensions;

  // ── Carryover bookings: created in an EARLIER month, but whose usage still
  // lands in this report month — either because it was always a long booking
  // spanning the boundary, or because a later extension pushed the return
  // date past the month it was booked in. Without this, a booking's nights
  // (and the revenue/commission tied to them) that fall after the report
  // month simply vanish — never billed in the origin month (correctly
  // clamped there) and never picked up anywhere else either, since a normal
  // month's query only looks at bookings *created* that month.
  const carryoverRefs = new Set<string>();

  if (bounds.from) {
    // Cheap, always-on check: original (unextended) stays that already run
    // past the start of this month — no extension involved, e.g. a 19-day
    // booking made last month that finishes a couple of days into this one.
    const { data: longBookings, error: longErr } = await sb
      .from('orders_raw')
      .select('order_reference')
      .eq('store_id', p.store_id)
      .eq('partner_ref', p.slug)
      .lt('created_at', bounds.from)
      .gte('dropoff_datetime', bounds.from);
    if (longErr) throw new Error(`Failed to fetch carryover bookings: ${longErr.message}`);
    for (const row of (longBookings ?? []) as Array<{ order_reference: string | null }>) {
      if (row.order_reference) carryoverRefs.add(row.order_reference);
    }

    // Only worth the extra orders/order_items round-trip when extensions
    // actually count toward commission for this partner — otherwise an
    // extended dropoff never affects money or (today) vehicle-days anyway.
    if (extensionsMatterForCommission) {
      const { data: partnerOrders } = await sb
        .from('orders')
        .select('id, booking_token')
        .eq('store_id', p.store_id)
        .eq('partner_ref', p.slug);
      const orderRowsAll = (partnerOrders ?? []) as Array<{ id: string; booking_token: string | null }>;
      const tokenByOrderId = new Map(orderRowsAll.map((o) => [o.id, o.booking_token]));
      const orderIdsAll = orderRowsAll.map((o) => o.id).filter(Boolean);

      if (orderIdsAll.length > 0) {
        const { data: extendedItems } = await sb
          .from('order_items')
          .select('order_id, dropoff_datetime')
          .in('order_id', orderIdsAll)
          .gte('dropoff_datetime', bounds.from);
        for (const item of (extendedItems ?? []) as Array<{ order_id: string; dropoff_datetime: string | null }>) {
          const ref = tokenByOrderId.get(item.order_id);
          if (ref) carryoverRefs.add(ref);
        }
      }
    }
  }

  let carryoverRawRows: RawBookingRow[] = [];
  if (carryoverRefs.size > 0 && bounds.from) {
    const { data, error: carryErr } = await sb
      .from('orders_raw')
      .select(RAW_BOOKING_SELECT)
      .eq('store_id', p.store_id)
      .eq('partner_ref', p.slug)
      .in('order_reference', Array.from(carryoverRefs))
      .lt('created_at', bounds.from);
    if (carryErr) throw new Error(`Failed to fetch carryover bookings: ${carryErr.message}`);
    carryoverRawRows = (data ?? []) as RawBookingRow[];
  }

  // Defensive de-dupe by id in case a row could ever satisfy both the primary
  // and carryover filters (shouldn't happen given the created_at cutoffs, but
  // double-counting a booking would corrupt totals, so guard against it).
  //
  // Also guard against a distinct false-positive: a booking created before
  // this month whose *entire* stay (pickup AND dropoff) lands in or after
  // this month (e.g. an ordinary advance booking made in July for a stay
  // that only starts in September) is NOT a "spans forward" carryover — the
  // stay never touched the earlier month at all, so it isn't split across
  // two reports. Its full commission stays attributed to its creation month
  // (see the monthShare fallback below). Only rows whose stay actually
  // started before this month's boundary (pickup < bounds.from) represent a
  // genuine split that should also surface here.
  const primaryIds = new Set(primaryRawRows.map((r) => r.id));
  const fromMs = bounds.from ? new Date(bounds.from).getTime() : null;
  carryoverRawRows = carryoverRawRows.filter((r) => {
    if (primaryIds.has(r.id)) return false;
    if (fromMs === null || !r.pickup_datetime) return true;
    return new Date(r.pickup_datetime).getTime() < fromMs;
  });

  const carryoverIds = new Set(carryoverRawRows.map((r) => r.id));
  const rawRows: RawBookingRow[] = [...primaryRawRows, ...carryoverRawRows];

  // Maps keyed by order_reference (booking_token) for extension data
  let paidExtensionByRef = new Map<string, number>();    // confirmed/collected extension amounts
  let pendingExtensionByRef = new Map<string, number>(); // pending (uncollected) extension amounts
  let extDropoffByRef = new Map<string, string>();       // updated return date from order_items

  if (extensionsMatterForCommission) {
    const refs = rawRows
      .map((r) => r.order_reference)
      .filter(Boolean) as string[];
    if (refs.length > 0) {
      const { data: orders } = await sb
        .from('orders')
        .select('id, booking_token')
        .eq('store_id', p.store_id)
        .eq('partner_ref', p.slug)
        .in('booking_token', refs);

      const orderRows = (orders ?? []) as Array<{ id: string; booking_token: string | null }>;
      const orderIds = orderRows.map((o) => o.id).filter(Boolean);
      const refByOrderId = new Map(orderRows.map((o) => [o.id, o.booking_token ?? '']));

      if (orderIds.length > 0) {
        // Extended return date from order_items (updated by the extend RPC)
        const { data: items } = await sb
          .from('order_items')
          .select('order_id, dropoff_datetime')
          .in('order_id', orderIds);
        for (const item of (items ?? []) as Array<{ order_id: string; dropoff_datetime: string | null }>) {
          const ref = refByOrderId.get(item.order_id);
          if (ref && item.dropoff_datetime) extDropoffByRef.set(ref, item.dropoff_datetime);
        }

        // Extension payments split by settlement status:
        //   pending   → customer hasn't paid yet (commission is pending)
        //   anything else (absorbed/null) → collected (commission is confirmed)
        const { data: extPmts } = await sb
          .from('payments')
          .select('order_id, amount, settlement_status')
          .in('order_id', orderIds)
          .eq('payment_type', 'extension');
        for (const pmt of (extPmts ?? []) as Array<{ order_id: string; amount: number | null; settlement_status: string | null }>) {
          const ref = refByOrderId.get(pmt.order_id);
          if (!ref) continue;
          const amt = Number(pmt.amount ?? 0);
          if (pmt.settlement_status === 'pending') {
            pendingExtensionByRef.set(ref, (pendingExtensionByRef.get(ref) ?? 0) + amt);
          } else {
            paidExtensionByRef.set(ref, (paidExtensionByRef.get(ref) ?? 0) + amt);
          }
        }
      }
    }
  }

  // Vehicle-days are clamped to the report month so e.g. a booking that runs
  // Jul 29 → Aug 2 only contributes 3 days to the July report. The SAME
  // clamp is reused below to prorate commission by the share of nights that
  // actually fall in this month.
  const monthStart = bounds.from ? new Date(bounds.from).getTime() : null;
  const monthEnd = bounds.to ? new Date(bounds.to).getTime() : null;

  function clampedRentalDays(pickup: string | null, dropoff: string | null): number {
    if (!pickup || !dropoff) return 0;
    const start = monthStart !== null ? Math.max(new Date(pickup).getTime(), monthStart) : new Date(pickup).getTime();
    const end = monthEnd !== null ? Math.min(new Date(dropoff).getTime(), monthEnd) : new Date(dropoff).getTime();
    return Math.max(0, (end - start) / 86_400_000);
  }

  function totalRentalDays(pickup: string | null, dropoff: string | null): number {
    if (!pickup || !dropoff) return 0;
    return Math.max(0, (new Date(dropoff).getTime() - new Date(pickup).getTime()) / 86_400_000);
  }

  const bookings = rawRows.map((row) => {
    const isCarryover = carryoverIds.has(row.id);
    const advanceDays = row.pickup_datetime
      ? calendarAdvanceDays(row.pickup_datetime, row.created_at)
      : null;
    const override = row.vehicle_model_id ? vehicleTermsByModel.get(row.vehicle_model_id) : undefined;
    const overrideHasCommission = override
      ? ['commission', 'combined', 'commission_delivery'].includes(override.deal_type)
        && override.commission_type != null
        && override.commission_value != null
      : false;
    const commissionType = override
      ? (overrideHasCommission ? override.commission_type : null)
      : p.commission_type;
    const commissionValue = override
      ? (overrideHasCommission ? Number(override.commission_value) : null)
      : Number(p.commission_value ?? 0);
    const advanceBookingDays = override?.advance_booking_days ?? p.advance_booking_days;
    const includesExtensions = override ? override.commission_includes_extensions : p.commission_includes_extensions;
    const commissionable =
      row.status !== 'cancelled' &&
      commissionType != null &&
      commissionValue != null &&
      advanceDays !== null &&
      advanceDays >= advanceBookingDays;

    // Extension amounts for this booking (only when the partner has the flag enabled)
    const ref = row.order_reference ?? '';
    const paidExtAmt = includesExtensions ? (paidExtensionByRef.get(ref) ?? 0) : 0;
    const pendingExtAmt = includesExtensions ? (pendingExtensionByRef.get(ref) ?? 0) : 0;
    const isExtended = includesExtensions && (paidExtAmt > 0 || pendingExtAmt > 0);
    const extendedDropoffDatetime = isExtended ? (extDropoffByRef.get(ref) ?? null) : null;

    // Commission base = original rental value + any collected extension amounts.
    // Pending (uncollected) extensions are excluded from confirmed commission and
    // surfaced separately so the portal can show a "Pending" indicator.
    const originalBase = Number(row.rental_value_raw ?? row.web_quote_raw ?? 0);
    const wholeStayBase = originalBase + paidExtAmt;

    // ── Prorate by nights actually falling in this report month ──
    // A booking entirely within one month has monthNights === totalNights,
    // so the fraction is 1 and behaviour is unchanged from before. A booking
    // that spans a month boundary (extension, or a long original stay) only
    // has its in-month share billed here; the remainder is picked up by the
    // carryover logic on whichever month(s) those nights actually fall in.
    const effectiveDropoff = extendedDropoffDatetime ?? row.dropoff_datetime;
    const totalNights = totalRentalDays(row.pickup_datetime, effectiveDropoff);
    const monthNights = clampedRentalDays(row.pickup_datetime, effectiveDropoff);
    // monthNights can be 0 with totalNights > 0 for a *primary* (this-month
    // created) booking whose stay hasn't started by month-end yet — e.g. an
    // ordinary advance booking made in July for a stay entirely in
    // September. That's not a "spans forward" split (nothing of the stay
    // touched this month), so keep full attribution here rather than
    // zeroing it out; the carryover filter above already excludes it from
    // being double-counted in the later month once its stay actually
    // occurs. A carryover row should never hit this branch since its
    // detection already requires real overlap, but if it somehow did, it
    // should contribute nothing here.
    const monthShare = totalNights <= 0 || monthNights <= 0
      ? (isCarryover ? 0 : 1)
      : Math.min(1, monthNights / totalNights);

    const monthBase = roundMoney(wholeStayBase * monthShare);
    const commissionBase = commissionType === 'fixed' ? null : monthBase;
    const commissionAmount = !commissionable
      ? 0
      : commissionType === 'fixed'
        // Fixed commission is a flat per-booking fee, not day-based — it is
        // paid once in full, in the booking's origin month, never split or
        // repeated for a carryover month.
        ? (isCarryover ? 0 : Number(commissionValue ?? 0))
        : roundMoney(monthBase * Number(commissionValue ?? 0) / 100);

    // Pending commission accrues only on percentage-type deals (fixed is per booking,
    // so there is no extra commission due when an extension is later collected).
    // Prorated by the same month-share fraction as the confirmed commission.
    const pendingCommissionAmount = !commissionable || commissionType !== 'percentage'
      ? 0
      : roundMoney(pendingExtAmt * monthShare * Number(commissionValue ?? 0) / 100);

    // ── Note shown when the stay is split across two calendar months ──
    let periodNote: string | null = null;
    const spansBoundary = bounds.from && bounds.to && totalNights > 0 && monthNights > 0 && monthNights < totalNights - 1e-6;
    if (spansBoundary && row.pickup_datetime && effectiveDropoff) {
      const rangeStart = new Date(Math.max(new Date(row.pickup_datetime).getTime(), monthStart ?? -Infinity)).toISOString();
      const rangeEnd = new Date(Math.min(new Date(effectiveDropoff).getTime(), monthEnd ?? Infinity)).toISOString();
      const totalNightsRounded = Math.round(totalNights);
      if (isCarryover) {
        periodNote = `Continued from ${fmtManilaShort(row.pickup_datetime)} booking — ${fmtManilaShort(rangeStart)}–${fmtManilaShort(rangeEnd)} of ${totalNightsRounded} total nights`;
      } else {
        const nextMonthName = bounds.to ? fmtMonthName(bounds.to) : 'next month';
        periodNote = `${fmtManilaShort(rangeStart)}–${fmtManilaShort(rangeEnd)} of ${totalNightsRounded} total nights; remainder continues into ${nextMonthName}`;
      }
    }

    return {
      id: row.id,
      orderReference: row.order_reference,
      customerName: row.customer_name,
      vehicleModelId: row.vehicle_model_id,
      pickupDatetime: row.pickup_datetime,
      dropoffDatetime: row.dropoff_datetime,
      rentalValue: Number(row.rental_value_raw ?? 0),
      bookingValue: Number(row.web_quote_raw ?? 0),
      commissionBase,
      commissionType,
      commissionValue,
      status: row.status,
      cancelledReason: row.cancelled_reason,
      cancelledAt: row.cancelled_at,
      bookedAt: row.created_at,
      advanceDays: advanceDays !== null ? Math.floor(advanceDays) : null,
      commissionable,
      commissionAmount,
      isExtended,
      extendedDropoffDatetime,
      pendingCommissionAmount,
      isCarryover,
      periodNote,
    } satisfies PartnerCommissionBooking;
  });

  const primaryBookings = bookings.filter((b) => !b.isCarryover);
  const totalCommission = bookings.reduce((sum, b) => sum + b.commissionAmount, 0);
  const totalPendingCommission = bookings.reduce((sum, b) => sum + b.pendingCommissionAmount, 0);
  const totalVehiclesRented = primaryBookings.filter((b) => b.status !== 'cancelled').length;
  const monthDays = daysInReportMonth(month);

  // Sum vehicle-days across BOTH primary and carryover bookings so nights
  // that spill into this month from an earlier booking are actually counted
  // here, instead of disappearing between the two months' reports.
  const totalVehicleDays = bookings
    .filter((b) => b.status !== 'cancelled')
    .reduce((sum, b) => {
      const effectiveDropoff = b.isExtended && b.extendedDropoffDatetime
        ? b.extendedDropoffDatetime
        : b.dropoffDatetime;
      return sum + clampedRentalDays(b.pickupDatetime, effectiveDropoff);
    }, 0);

  return {
    totalBookings: primaryBookings.length,
    commissionableBookings: primaryBookings.filter((b) => b.commissionable).length,
    totalCommission: roundMoney(totalCommission),
    totalPendingCommission: roundMoney(totalPendingCommission),
    totalVehiclesRented,
    averageVehiclesPerDay: roundMoney(totalVehicleDays / monthDays),
    bookings,
  };
}
