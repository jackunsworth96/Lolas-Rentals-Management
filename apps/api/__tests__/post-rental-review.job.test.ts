import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  sendWhatsAppTemplate: vi.fn(),
}));

vi.mock('../src/adapters/supabase/client.js', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}));

vi.mock('../src/services/whatsapp-template.js', () => ({
  sendWhatsAppTemplate: mocks.sendWhatsAppTemplate,
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

  it('greets the customer by first name while retaining their full name in context', async () => {
    const orderItemsQuery = resolvedQuery([{
      orders: {
        booking_token: 'LR-1', customer_id: 'customer-1',
        customers: { name: '  Alfie   Magwood  ', mobile: '+639171234567', whatsapp_review_opt_out: false },
      },
    }]);
    mocks.getSupabaseClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'order_items') return orderItemsQuery;
        if (table === 'post_rental_review_log') return {
          select: () => ({ in: async () => ({ data: [], error: null }) }),
          insert: async () => ({ error: null }),
        };
        throw new Error(`Unexpected table ${table}`);
      },
    });
    mocks.sendWhatsAppTemplate.mockResolvedValue({ delivered: true });

    await runPostRentalReviewJob();

    expect(mocks.sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({
      parameters: ['Alfie'],
      failureContext: expect.objectContaining({ customerName: 'Alfie   Magwood' }),
    }));
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
    expect(mocks.sendWhatsAppTemplate).not.toHaveBeenCalled();
  });
});
