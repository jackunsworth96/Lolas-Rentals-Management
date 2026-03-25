/**
 * Extract pickup/dropoff dates and locations from WooCommerce raw order payload.
 * Supports WooCommerce Bookings, RNB (Rental & Booking), and generic rental plugins.
 */

const PICKUP_KEYS = [
  '_pickup_hidden_datetime',
  'Pickup Date & Time',
  '_booking_start',
  '_wc_booking_start_date',
  '_wc_booking_start_date_time',
  '_rental_date_start',
  'rental_start',
  'pickup_date',
  '_booking_pickup_datetime',
  'pickup_datetime',
  'Booking Start Date',
  'Start Date',
] as const;

const DROPOFF_KEYS = [
  '_return_hidden_datetime',
  'Return Date & Time',
  '_booking_end',
  '_wc_booking_end_date',
  '_wc_booking_end_date_time',
  '_rental_date_end',
  'rental_end',
  'dropoff_date',
  '_booking_dropoff_datetime',
  'dropoff_datetime',
  'Booking End Date',
  'End Date',
] as const;

const PICKUP_LOCATION_KEYS = [
  'Pickup Location',
  'pickup_location',
  'Delivery Location',
] as const;

const DROPOFF_LOCATION_KEYS = [
  'Return Location',
  'Dropoff Location',
  'dropoff_location',
  'return_location',
] as const;

function getMetaValue(
  meta: Array<{ key?: string; display_key?: string; value?: unknown }>,
  searchKey: string,
): string | null {
  if (!Array.isArray(meta)) return null;
  const lowerKey = searchKey.toLowerCase();
  const entry = meta.find(
    (m) =>
      String(m?.key ?? '').toLowerCase() === lowerKey ||
      String(m?.display_key ?? '').toLowerCase() === lowerKey,
  );
  const val = entry?.value;
  if (val == null || val === '') return null;
  return String(val).trim() || null;
}

function getMetaObject(
  meta: Array<{ key?: string; value?: unknown }>,
  searchKey: string,
): Record<string, unknown> | null {
  if (!Array.isArray(meta)) return null;
  const lowerKey = searchKey.toLowerCase();
  const entry = meta.find(
    (m) => String(m?.key ?? '').toLowerCase() === lowerKey,
  );
  if (entry?.value && typeof entry.value === 'object' && !Array.isArray(entry.value)) {
    return entry.value as Record<string, unknown>;
  }
  return null;
}

function parse12hTo24h(timeStr: string): { h: number; min: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const min = parseInt(match[2], 10);
  const ampm = match[3].toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  return { h, min };
}

/**
 * Parse various date/time formats into YYYY-MM-DDTHH:mm.
 * Handles: ISO, "YYYY-MM-DD|HH:mm am/pm" (RNB pipe), "MM/DD/YYYY at HH:mm am/pm" (RNB display).
 */
function parseToDatetimeLocal(val: string | null): string {
  if (!val || typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';

  // RNB pipe format: "2026-03-16|09:15 am"
  const pipeMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})\|(.+)$/);
  if (pipeMatch) {
    const datePart = pipeMatch[1];
    const parsed = parse12hTo24h(pipeMatch[2].trim());
    if (parsed) {
      return `${datePart}T${String(parsed.h).padStart(2, '0')}:${String(parsed.min).padStart(2, '0')}`;
    }
    return `${datePart}T00:00`;
  }

  // RNB display format: "03/16/2026 at 09:15 am"
  const atMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+at\s+(.+)$/i);
  if (atMatch) {
    const mm = atMatch[1].padStart(2, '0');
    const dd = atMatch[2].padStart(2, '0');
    const yyyy = atMatch[3];
    const parsed = parse12hTo24h(atMatch[4].trim());
    if (parsed) {
      return `${yyyy}-${mm}-${dd}T${String(parsed.h).padStart(2, '0')}:${String(parsed.min).padStart(2, '0')}`;
    }
    return `${yyyy}-${mm}-${dd}T00:00`;
  }

  // Standard ISO or Date-parseable
  try {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
  } catch {
    return '';
  }
}

/**
 * Combine separate date and time strings (from RNB rnb_hidden_order_meta).
 */
function combineDateAndTime(date: string, time: string): string {
  if (!date) return '';
  const parsed = parse12hTo24h(time.trim());
  if (parsed) {
    return `${date}T${String(parsed.h).padStart(2, '0')}:${String(parsed.min).padStart(2, '0')}`;
  }
  return `${date}T00:00`;
}

function searchKeysInPayload(payload: Record<string, unknown>, keys: readonly string[]): string {
  // 1. Top-level keys
  for (const key of keys) {
    const val = payload[key];
    if (val != null && val !== '') {
      const str = String(val).trim();
      if (str) {
        const result = parseToDatetimeLocal(str);
        if (result) return result;
      }
    }
  }

  // 2. Order-level meta_data
  const meta = payload.meta_data as Array<{ key?: string; value?: unknown }> | undefined;
  if (meta) {
    for (const key of keys) {
      const val = getMetaValue(meta, key);
      if (val) {
        const result = parseToDatetimeLocal(val);
        if (result) return result;
      }
    }
  }

  // 3. First line_item meta_data
  const items = payload.line_items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items.length > 0) {
    const itemMeta = items[0].meta_data as Array<{ key?: string; value?: unknown }> | undefined;
    if (itemMeta) {
      for (const key of keys) {
        const val = getMetaValue(itemMeta, key);
        if (val) {
          const result = parseToDatetimeLocal(val);
          if (result) return result;
        }
      }
    }
  }

  return '';
}

/**
 * Try extracting dates from RNB's rnb_hidden_order_meta deep object.
 * Contains pickup_date, pickup_time, dropoff_date, dropoff_time as separate fields.
 */
function extractRnbDeep(payload: Record<string, unknown>): { pickup: string; dropoff: string } {
  const items = payload.line_items as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(items) || items.length === 0) return { pickup: '', dropoff: '' };

  const itemMeta = items[0].meta_data as Array<{ key?: string; value?: unknown }> | undefined;
  if (!itemMeta) return { pickup: '', dropoff: '' };

  const rnb = getMetaObject(itemMeta, 'rnb_hidden_order_meta');
  if (!rnb) return { pickup: '', dropoff: '' };

  const pickupDate = String(rnb.pickup_date ?? '').trim();
  const pickupTime = String(rnb.pickup_time ?? '').trim();
  const dropoffDate = String(rnb.dropoff_date ?? '').trim();
  const dropoffTime = String(rnb.dropoff_time ?? '').trim();

  return {
    pickup: pickupDate ? combineDateAndTime(pickupDate, pickupTime) : '',
    dropoff: dropoffDate ? combineDateAndTime(dropoffDate, dropoffTime) : '',
  };
}

export function extractPickupDatetime(payload: Record<string, unknown>): string {
  const result = searchKeysInPayload(payload, PICKUP_KEYS);
  if (result) return result;

  const rnb = extractRnbDeep(payload);
  return rnb.pickup;
}

export function extractDropoffDatetime(payload: Record<string, unknown>): string {
  const result = searchKeysInPayload(payload, DROPOFF_KEYS);
  if (result) return result;

  const rnb = extractRnbDeep(payload);
  return rnb.dropoff;
}

export function extractPickupDropoffFromPayload(payload: Record<string, unknown>): {
  pickup: string;
  dropoff: string;
} {
  const pickup = searchKeysInPayload(payload, PICKUP_KEYS);
  const dropoff = searchKeysInPayload(payload, DROPOFF_KEYS);

  if (pickup || dropoff) return { pickup, dropoff };

  return extractRnbDeep(payload);
}

export function toDatetimeLocal(val: string | null | undefined): string {
  return parseToDatetimeLocal(val ?? null);
}

export function extractPickupDate(payload: Record<string, unknown>): string | null {
  const dt = extractPickupDatetime(payload);
  if (!dt) return null;
  const datePart = dt.split('T')[0];
  return datePart || null;
}

// ── Location extraction ──

function searchLocationInMeta(
  meta: Array<{ key?: string; display_key?: string; value?: unknown }>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const val = getMetaValue(meta, key);
    if (val) return val;
  }
  return null;
}

function extractLocationFromRnb(
  rnb: Record<string, unknown>,
  field: string,
): string | null {
  const loc = rnb[field];
  if (typeof loc === 'string' && loc.trim()) return loc.trim();
  if (loc && typeof loc === 'object') {
    const obj = loc as Record<string, unknown>;
    const name = obj.name ?? obj.address ?? '';
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return null;
}

export function extractPickupLocation(payload: Record<string, unknown>): string | null {
  const items = payload.line_items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items.length > 0) {
    const itemMeta = items[0].meta_data as Array<{ key?: string; display_key?: string; value?: unknown }> | undefined;
    if (itemMeta) {
      const val = searchLocationInMeta(itemMeta, PICKUP_LOCATION_KEYS);
      if (val) return val;

      const rnb = getMetaObject(itemMeta, 'rnb_hidden_order_meta');
      if (rnb) {
        const loc = extractLocationFromRnb(rnb, 'pickup_location');
        if (loc) return loc;
      }
    }
  }

  const meta = payload.meta_data as Array<{ key?: string; display_key?: string; value?: unknown }> | undefined;
  if (meta) {
    const val = searchLocationInMeta(meta, PICKUP_LOCATION_KEYS);
    if (val) return val;
  }

  return null;
}

export function extractDropoffLocation(payload: Record<string, unknown>): string | null {
  const items = payload.line_items as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(items) && items.length > 0) {
    const itemMeta = items[0].meta_data as Array<{ key?: string; display_key?: string; value?: unknown }> | undefined;
    if (itemMeta) {
      const val = searchLocationInMeta(itemMeta, DROPOFF_LOCATION_KEYS);
      if (val) return val;

      const rnb = getMetaObject(itemMeta, 'rnb_hidden_order_meta');
      if (rnb) {
        const loc = extractLocationFromRnb(rnb, 'return_location');
        if (loc) return loc;
      }
    }
  }

  const meta = payload.meta_data as Array<{ key?: string; display_key?: string; value?: unknown }> | undefined;
  if (meta) {
    const val = searchLocationInMeta(meta, DROPOFF_LOCATION_KEYS);
    if (val) return val;
  }

  return null;
}

/**
 * Strip cost suffixes like "(FREE)", "(P200)", "(₱500)" from a location string
 * to normalize it for matching against config locations.
 */
export function normalizeLocationName(raw: string): string {
  return raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
}
