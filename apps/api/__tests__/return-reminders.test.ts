import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
  resolveWhatsAppRecipient: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/lib/logger.js', () => ({ logger: mocks.logger }));
vi.mock('../src/services/whatsapp-template.js', () => ({
  InvalidWhatsAppNumberError: class extends Error {},
  sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
  resolveWhatsAppRecipient: mocks.resolveWhatsAppRecipient,
}));

const { runReturnReminderJob } = await import('../src/jobs/return-reminder.job.js');
const { runReturnReminderTodayJob } = await import('../src/jobs/return-reminder-today.job.js');
const { runNinePmReturnReminderJob } = await import('../src/jobs/nine-pm-return-reminder.job.js');

type Row = Record<string, unknown>;
const reference = 'LR-1031-10B4';

function reminderDatabase(source: 'raw' | 'staff', ninePm: boolean) {
  const tables: Record<string, Row[]> = {
    orders_raw: [], order_items: [], order_addons: [],
    return_reminder_log: [], return_reminder_today_log: [], nine_pm_reminder_log: [],
  };
  const booking: Row = source === 'raw'
    ? {
      order_reference: reference, customer_name: 'Ada', customer_mobile: '+639171234567',
      status: ninePm ? 'unprocessed' : 'confirmed', addon_ids: ninePm ? [9] : [],
    }
    : {
      order_id: 'order-1',
      orders: { booking_token: reference, status: 'active', customers: { name: 'Ada', mobile: '+639171234567' } },
    };
  tables[source === 'raw' ? 'orders_raw' : 'order_items'].push(booking);
  if (ninePm && source === 'staff') tables.order_addons.push({ order_id: 'order-1' });

  let failingTable: string | undefined;
  const from = (table: string) => {
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return query;
      },
      in: (column: string, values: unknown[]) => {
        filters.push((row) => values.includes(column === 'orders.status' ? (row.orders as Row).status : row[column]));
        return query;
      },
      gte: (column: string, value: string) => {
        filters.push((row) => new Date(row[column] as string) >= new Date(value));
        return query;
      },
      lte: (column: string, value: string) => {
        filters.push((row) => new Date(row[column] as string) <= new Date(value));
        return query;
      },
      or: () => query,
      contains: (column: string, values: unknown[]) => {
        filters.push((row) => values.every((value) => (row[column] as unknown[]).includes(value)));
        return query;
      },
      insert: async (row: Row) => {
        tables[table].push(row);
        return { error: null };
      },
      then: (resolve: (value: { data: Row[] | null; error: { message: string } | null }) => unknown) =>
        Promise.resolve(table === failingTable
          ? { data: null, error: { message: 'return_date column missing' } }
          : { data: tables[table].filter((row) => filters.every((filter) => filter(row))), error: null }).then(resolve),
    };
    return query;
  };
  return { tables, booking, from, failReads: (table: string) => { failingTable = table; } };
}

const jobs = [
  { name: 'tomorrow', run: runReturnReminderJob, table: 'return_reminder_log', prefix: 'return-reminder', dayOffset: 1, ninePm: false },
  { name: 'today', run: runReturnReminderTodayJob, table: 'return_reminder_today_log', prefix: 'return-reminder-today', dayOffset: 0, ninePm: false },
  { name: '9 PM', run: runNinePmReturnReminderJob, table: 'nine_pm_reminder_log', prefix: '', dayOffset: 0, ninePm: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('RESPOND_IO_API_URL', 'https://respond.example');
  vi.stubEnv('RESPOND_IO_OUTBOUND_TOKEN', 'test-token');
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
  mocks.sendWhatsAppTemplate.mockResolvedValue({ delivered: true });
  mocks.resolveWhatsAppRecipient.mockResolvedValue('+639171234567');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each(jobs)('$name return reminder', (job) => {
  it.each(['raw', 'staff'] as const)('reminds again after an extension and skips reruns for the same return date (%s)', async (source) => {
    const db = reminderDatabase(source, job.ninePm);
    mocks.getSupabaseClient.mockReturnValue(db);

    for (const day of [7, 9, 12]) {
      // UTC is still the previous date; all keys and windows must use Manila dates.
      vi.setSystemTime(new Date(`2026-11-${String(day - 1).padStart(2, '0')}T23:30:00Z`));
      const returnDate = `2026-11-${String(day + job.dayOffset).padStart(2, '0')}`;
      db.booking.dropoff_datetime = `${returnDate}T08:45:00Z`;
      await job.run();
      db.booking.dropoff_datetime = `${returnDate}T09:00:00Z`;
      await job.run();
      expect(db.tables[job.table]).toHaveLength([7, 9, 12].indexOf(day) + 1);
      expect(db.tables[job.table].at(-1)).toMatchObject({ booking_reference: reference, return_date: returnDate });
    }

    if (job.ninePm) {
      expect(fetch).toHaveBeenCalledTimes(3);
    } else {
      expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledTimes(3);
      const keys = mocks.sendWhatsAppTemplate.mock.calls.map(([input]) => input.operationKey);
      expect(new Set(keys).size).toBe(3);
      expect(keys[0]).toBe(`${job.prefix}:${reference}:2026-11-0${7 + job.dayOffset}`);
      expect(fetch).not.toHaveBeenCalled();
    }
  });

  it.skipIf(job.ninePm)('uses the changed return time on the order item', async () => {
    vi.setSystemTime(new Date('2026-11-06T23:30:00Z'));
    const db = reminderDatabase('staff', job.ninePm);
    // Booked for 12:15 PM, moved earlier to 10:30 AM Manila via "Change return time".
    db.booking.dropoff_datetime = `2026-11-0${7 + job.dayOffset}T02:30:00Z`;
    db.booking.original_dropoff_datetime = `2026-11-0${7 + job.dayOffset}T04:15:00Z`;
    mocks.getSupabaseClient.mockReturnValue(db);

    await job.run();

    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
    const [returnTime] = mocks.sendWhatsAppTemplate.mock.calls[0][0].parameters.slice(-1);
    expect(returnTime).toMatch(/^10:30\s?(AM|am)$/);
  });

  it('does not send when the deduplication query fails', async () => {
    vi.setSystemTime(new Date('2026-11-07T01:00:00Z'));
    const db = reminderDatabase('staff', job.ninePm);
    db.booking.dropoff_datetime = `2026-11-0${7 + job.dayOffset}T08:45:00Z`;
    db.failReads(job.table);
    mocks.getSupabaseClient.mockReturnValue(db);

    await job.run();

    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(
      { error: 'return_date column missing' }, expect.stringContaining('dedup log query failed'),
    );
  });
});
