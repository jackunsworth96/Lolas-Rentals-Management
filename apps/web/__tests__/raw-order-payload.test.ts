/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import {
  extractPickupDatetime,
  extractDropoffDatetime,
  extractPickupDropoffFromPayload,
  extractPickupDate,
  toDatetimeLocal,
  extractPickupLocation,
  extractDropoffLocation,
  normalizeLocationName,
} from '../src/utils/raw-order-payload.js';
import { findRate } from '../src/components/orders/BookingModal.js';

describe('raw-order-payload', () => {
  describe('extractPickupDatetime', () => {
    it('extracts from top-level rental_start', () => {
      const payload = { rental_start: '2025-03-15T09:00:00' };
      expect(extractPickupDatetime(payload)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
      expect(extractPickupDatetime(payload)).toContain('2025-03-15');
    });

    it('extracts from meta_data array', () => {
      const payload = {
        meta_data: [
          { key: '_rental_date_start', value: '2025-03-20T10:00:00' },
        ],
      };
      const result = extractPickupDatetime(payload);
      expect(result).toContain('2025-03-20');
    });

    it('extracts from first line_item meta_data', () => {
      const payload = {
        line_items: [
          {
            meta_data: [{ key: 'pickup_date', value: '2025-04-01T08:00' }],
          },
        ],
      };
      const result = extractPickupDatetime(payload);
      expect(result).toContain('2025-04-01');
    });

    it('returns empty string when no pickup found', () => {
      expect(extractPickupDatetime({})).toBe('');
      expect(extractPickupDatetime({ foo: 'bar' })).toBe('');
    });

    it('extracts from WooCommerce Bookings _booking_start', () => {
      const payload = { _booking_start: '2025-06-01T10:00:00' };
      expect(extractPickupDatetime(payload)).toContain('2025-06-01');
    });

    it('extracts from WooCommerce Bookings meta_data _wc_booking_start_date', () => {
      const payload = {
        meta_data: [
          { key: '_wc_booking_start_date', value: '2025-07-10T09:00:00' },
        ],
      };
      expect(extractPickupDatetime(payload)).toContain('2025-07-10');
    });

    it('extracts from line_item meta_data via display_key', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: '_hidden_key', display_key: 'Booking Start Date', value: '2025-08-20T11:00:00' },
            ],
          },
        ],
      };
      expect(extractPickupDatetime(payload)).toContain('2025-08-20');
    });

    it('parses RNB pipe format: YYYY-MM-DD|HH:mm am/pm', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-03-16|09:15 am' },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-03-16T09:15');
    });

    it('parses RNB pipe format with PM', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-04-01|02:30 pm' },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-04-01T14:30');
    });

    it('parses RNB display format: MM/DD/YYYY at HH:mm am/pm', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: 'Pickup Date & Time', value: '03/16/2026 at 09:15 am' },
            ],
          },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-03-16T09:15');
    });

    it('parses RNB display format with PM time', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { display_key: 'Pickup Date & Time', key: '_x', value: '12/25/2026 at 01:00 pm' },
            ],
          },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-12-25T13:00');
    });

    it('handles 12:00 am correctly (midnight)', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-01-01|12:00 am' },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-01-01T00:00');
    });

    it('handles 12:00 pm correctly (noon)', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-06-15|12:00 pm' },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-06-15T12:00');
    });

    it('extracts from rnb_hidden_order_meta fallback', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: {
                  pickup_date: '2026-05-10',
                  pickup_time: '10:30 am',
                },
              },
            ],
          },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-05-10T10:30');
    });

    it('prefers _pickup_hidden_datetime over rnb_hidden_order_meta', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-03-16|09:15 am' },
        ],
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: { pickup_date: '2026-05-10', pickup_time: '10:30 am' },
              },
            ],
          },
        ],
      };
      expect(extractPickupDatetime(payload)).toBe('2026-03-16T09:15');
    });
  });

  describe('extractDropoffDatetime', () => {
    it('extracts from top-level rental_end', () => {
      const payload = { rental_end: '2025-03-18T17:00:00' };
      expect(extractDropoffDatetime(payload)).toContain('2025-03-18');
    });

    it('extracts from meta_data array', () => {
      const payload = {
        meta_data: [{ key: '_rental_date_end', value: '2025-03-25T18:00' }],
      };
      expect(extractDropoffDatetime(payload)).toContain('2025-03-25');
    });

    it('returns empty string when no dropoff found', () => {
      expect(extractDropoffDatetime({})).toBe('');
    });

    it('extracts from WooCommerce Bookings _booking_end', () => {
      const payload = { _booking_end: '2025-06-05T16:00:00' };
      expect(extractDropoffDatetime(payload)).toContain('2025-06-05');
    });

    it('extracts from meta_data via display_key "End Date"', () => {
      const payload = {
        meta_data: [
          { key: '_internal', display_key: 'End Date', value: '2025-09-15T18:00:00' },
        ],
      };
      expect(extractDropoffDatetime(payload)).toContain('2025-09-15');
    });

    it('parses RNB pipe format for dropoff', () => {
      const payload = {
        meta_data: [
          { key: '_return_hidden_datetime', value: '2026-03-19|09:15 am' },
        ],
      };
      expect(extractDropoffDatetime(payload)).toBe('2026-03-19T09:15');
    });

    it('parses RNB display format: Return Date & Time', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: 'Return Date & Time', value: '03/19/2026 at 09:15 am' },
            ],
          },
        ],
      };
      expect(extractDropoffDatetime(payload)).toBe('2026-03-19T09:15');
    });

    it('extracts from rnb_hidden_order_meta fallback for dropoff', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: {
                  dropoff_date: '2026-05-15',
                  dropoff_time: '04:00 pm',
                },
              },
            ],
          },
        ],
      };
      expect(extractDropoffDatetime(payload)).toBe('2026-05-15T16:00');
    });
  });

  describe('extractPickupDropoffFromPayload', () => {
    it('returns both pickup and dropoff in one call', () => {
      const payload = {
        rental_start: '2025-03-15T09:00',
        rental_end: '2025-03-18T17:00',
      };
      const { pickup, dropoff } = extractPickupDropoffFromPayload(payload);
      expect(pickup).toContain('2025-03-15');
      expect(dropoff).toContain('2025-03-18');
    });

    it('returns empty strings when payload has no dates', () => {
      const { pickup, dropoff } = extractPickupDropoffFromPayload({});
      expect(pickup).toBe('');
      expect(dropoff).toBe('');
    });

    it('works with WooCommerce Bookings keys', () => {
      const payload = {
        _booking_start: '2025-06-01T10:00:00',
        _booking_end: '2025-06-05T16:00:00',
      };
      const { pickup, dropoff } = extractPickupDropoffFromPayload(payload);
      expect(pickup).toContain('2025-06-01');
      expect(dropoff).toContain('2025-06-05');
    });

    it('works with full RNB payload structure', () => {
      const payload = {
        meta_data: [
          { key: '_pickup_hidden_datetime', value: '2026-03-16|09:15 am' },
          { key: '_return_hidden_datetime', value: '2026-03-19|09:15 am' },
        ],
      };
      const { pickup, dropoff } = extractPickupDropoffFromPayload(payload);
      expect(pickup).toBe('2026-03-16T09:15');
      expect(dropoff).toBe('2026-03-19T09:15');
    });

    it('falls back to rnb_hidden_order_meta when primary keys missing', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: {
                  pickup_date: '2026-05-10',
                  pickup_time: '10:30 am',
                  dropoff_date: '2026-05-15',
                  dropoff_time: '04:00 pm',
                },
              },
            ],
          },
        ],
      };
      const { pickup, dropoff } = extractPickupDropoffFromPayload(payload);
      expect(pickup).toBe('2026-05-10T10:30');
      expect(dropoff).toBe('2026-05-15T16:00');
    });
  });

  describe('extractPickupDate', () => {
    it('returns YYYY-MM-DD for filtering', () => {
      const payload = { rental_start: '2025-03-15T09:00:00' };
      expect(extractPickupDate(payload)).toBe('2025-03-15');
    });

    it('returns null when no pickup found', () => {
      expect(extractPickupDate({})).toBe(null);
    });

    it('works with RNB pipe format', () => {
      const payload = {
        meta_data: [{ key: '_pickup_hidden_datetime', value: '2026-03-16|09:15 am' }],
      };
      expect(extractPickupDate(payload)).toBe('2026-03-16');
    });

    it('works with RNB display format', () => {
      const payload = {
        line_items: [
          {
            meta_data: [{ key: 'Pickup Date & Time', value: '03/20/2026 at 11:00 am' }],
          },
        ],
      };
      expect(extractPickupDate(payload)).toBe('2026-03-20');
    });
  });

  describe('toDatetimeLocal', () => {
    it('converts ISO string to datetime-local format', () => {
      const result = toDatetimeLocal('2025-03-15T09:30:00Z');
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    });

    it('returns empty string for null/undefined', () => {
      expect(toDatetimeLocal(null)).toBe('');
      expect(toDatetimeLocal(undefined)).toBe('');
    });

    it('handles RNB pipe format', () => {
      expect(toDatetimeLocal('2026-03-16|09:15 am')).toBe('2026-03-16T09:15');
    });
  });

  describe('extractPickupLocation', () => {
    it('extracts from line_items meta_data "Pickup Location"', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: 'Pickup Location', value: 'BASS Bikes (FREE)' },
            ],
          },
        ],
      };
      expect(extractPickupLocation(payload)).toBe('BASS Bikes (FREE)');
    });

    it('extracts via display_key', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: '_x', display_key: 'Pickup Location', value: 'Hotel Lobby' },
            ],
          },
        ],
      };
      expect(extractPickupLocation(payload)).toBe('Hotel Lobby');
    });

    it('extracts from order-level meta_data', () => {
      const payload = {
        meta_data: [
          { key: 'pickup_location', value: 'Airport Terminal 3' },
        ],
      };
      expect(extractPickupLocation(payload)).toBe('Airport Terminal 3');
    });

    it('extracts from rnb_hidden_order_meta', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: { pickup_location: 'Store Front' },
              },
            ],
          },
        ],
      };
      expect(extractPickupLocation(payload)).toBe('Store Front');
    });

    it('returns null when no location found', () => {
      expect(extractPickupLocation({})).toBeNull();
      expect(extractPickupLocation({ line_items: [{ meta_data: [] }] })).toBeNull();
    });
  });

  describe('extractDropoffLocation', () => {
    it('extracts from line_items meta_data "Return Location"', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: 'Return Location', value: 'BASS Bikes (FREE)' },
            ],
          },
        ],
      };
      expect(extractDropoffLocation(payload)).toBe('BASS Bikes (FREE)');
    });

    it('extracts via display_key', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              { key: '_y', display_key: 'Return Location', value: 'Office' },
            ],
          },
        ],
      };
      expect(extractDropoffLocation(payload)).toBe('Office');
    });

    it('extracts from rnb_hidden_order_meta return_location', () => {
      const payload = {
        line_items: [
          {
            meta_data: [
              {
                key: 'rnb_hidden_order_meta',
                value: { return_location: 'Airport Drop' },
              },
            ],
          },
        ],
      };
      expect(extractDropoffLocation(payload)).toBe('Airport Drop');
    });

    it('returns null when no location found', () => {
      expect(extractDropoffLocation({})).toBeNull();
    });
  });

  describe('normalizeLocationName', () => {
    it('strips "(FREE)" suffix', () => {
      expect(normalizeLocationName('BASS Bikes (FREE)')).toBe('BASS Bikes');
    });

    it('strips "(P200)" suffix', () => {
      expect(normalizeLocationName('Airport (P200)')).toBe('Airport');
    });

    it('leaves plain names unchanged', () => {
      expect(normalizeLocationName('Hotel Lobby')).toBe('Hotel Lobby');
    });

    it('handles empty string', () => {
      expect(normalizeLocationName('')).toBe('');
    });

    it('strips trailing whitespace after parentheses', () => {
      expect(normalizeLocationName('Store (FREE)  ')).toBe('Store');
    });
  });

  describe('real-world RNB payload scenario', () => {
    const realPayload = {
      id: 12345,
      number: '12345',
      total: '2400.00',
      billing: {
        first_name: 'Jane',
        last_name: 'Doe',
        email: 'jane@example.com',
        phone: '+63123456',
      },
      meta_data: [
        { key: '_pickup_hidden_datetime', value: '2026-03-16|09:15 am' },
        { key: '_return_hidden_datetime', value: '2026-03-19|09:15 am' },
      ],
      line_items: [
        {
          name: 'Honda Click 125 - 3 Day Rental',
          quantity: 1,
          total: '2400.00',
          meta_data: [
            { key: 'Pickup Date & Time', display_key: 'Pickup Date & Time', value: '03/16/2026 at 09:15 am' },
            { key: 'Return Date & Time', display_key: 'Return Date & Time', value: '03/19/2026 at 09:15 am' },
            { key: 'Pickup Location', display_key: 'Pickup Location', value: 'BASS Bikes (FREE)' },
            { key: 'Return Location', display_key: 'Return Location', value: 'BASS Bikes (FREE)' },
          ],
        },
      ],
    };

    it('extracts pickup datetime correctly', () => {
      expect(extractPickupDatetime(realPayload)).toBe('2026-03-16T09:15');
    });

    it('extracts dropoff datetime correctly', () => {
      expect(extractDropoffDatetime(realPayload)).toBe('2026-03-19T09:15');
    });

    it('extracts pickup date for filtering', () => {
      expect(extractPickupDate(realPayload)).toBe('2026-03-16');
    });

    it('extracts pickup location', () => {
      expect(extractPickupLocation(realPayload)).toBe('BASS Bikes (FREE)');
    });

    it('extracts dropoff location', () => {
      expect(extractDropoffLocation(realPayload)).toBe('BASS Bikes (FREE)');
    });

    it('normalizes extracted location name', () => {
      const loc = extractPickupLocation(realPayload);
      expect(normalizeLocationName(loc!)).toBe('BASS Bikes');
    });
  });
});

describe('findRate', () => {
  const tiers = [
    { modelId: 'model-a', minDays: 1, maxDays: 3, dailyRate: 800 },
    { modelId: 'model-a', minDays: 4, maxDays: 7, dailyRate: 700 },
    { modelId: 'model-a', minDays: 8, maxDays: 30, dailyRate: 600 },
    { modelId: 'model-b', minDays: 1, maxDays: 7, dailyRate: 1200 },
  ];

  it('returns correct rate for matching tier', () => {
    expect(findRate('model-a', 2, tiers)).toBe(800);
    expect(findRate('model-a', 5, tiers)).toBe(700);
    expect(findRate('model-a', 15, tiers)).toBe(600);
  });

  it('returns correct rate for different model', () => {
    expect(findRate('model-b', 3, tiers)).toBe(1200);
  });

  it('returns null when no tier matches the day count', () => {
    expect(findRate('model-a', 31, tiers)).toBeNull();
  });

  it('returns null when modelId is null or undefined', () => {
    expect(findRate(null, 5, tiers)).toBeNull();
    expect(findRate(undefined, 5, tiers)).toBeNull();
  });

  it('returns null when modelId has no pricing tiers', () => {
    expect(findRate('model-unknown', 5, tiers)).toBeNull();
  });

  it('returns null when tiers is empty', () => {
    expect(findRate('model-a', 5, [])).toBeNull();
  });

  it('matches exact boundary days (min and max)', () => {
    expect(findRate('model-a', 1, tiers)).toBe(800);
    expect(findRate('model-a', 3, tiers)).toBe(800);
    expect(findRate('model-a', 4, tiers)).toBe(700);
    expect(findRate('model-a', 7, tiers)).toBe(700);
    expect(findRate('model-a', 8, tiers)).toBe(600);
    expect(findRate('model-a', 30, tiers)).toBe(600);
  });
});
