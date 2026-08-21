import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  sendRespondIoTemplateMessage: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

vi.mock('../src/services/respond-io-outbound.js', () => ({
  sendRespondIoTemplateMessage: mocks.sendRespondIoTemplateMessage,
}));

const { runPostRentalReviewJob } = await import('../src/jobs/post-rental-review.job.js');

function resolvedQuery(data: unknown[] = []) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(async () => ({ data, error: null })),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
  };
  return query;
}

describe('runPostRentalReviewJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not treat a processed raw booking as completed before its extended 9 PM return', async () => {
    const orderItemsQuery = resolvedQuery([]);
    const from = vi.fn((table: string) => {
      if (table === 'orders_raw') {
        throw new Error('Processed raw bookings must not be queried for post-rental reviews');
      }
      if (table === 'order_items') return orderItemsQuery;
      throw new Error(`Unexpected table ${table}`);
    });

    mocks.getSupabaseClient.mockReturnValue({ from });

    await runPostRentalReviewJob();

    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith('order_items');
    expect(orderItemsQuery.eq).toHaveBeenCalledWith('orders.status', 'completed');
    expect(mocks.sendRespondIoTemplateMessage).not.toHaveBeenCalled();
  });
});
