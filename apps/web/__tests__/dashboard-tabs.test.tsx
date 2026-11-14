import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ permissions: [] as string[], withData: true }));

const metrics = {
  activeRentals: 12,
  availableVehicles: 0,
  ninepmReturns: {
    count: 1,
    vehicles: [{
      orderId: 'o1', vehicleModel: 'Honda Beat', vehicleName: 'Beat 07', returnTime: '21:00',
      customerName: 'Ana', customerMobile: '+63 917 000 0000', helmetNumbers: '4, 5', balanceDue: 500, securityDeposit: 1000,
    }],
  },
  depositsWithheld: 3000,
  depositsWithheldByMethod: { cash: 2000, gcash: 1000, bank: 0 },
  fleetUtilisation: 80,
  maintenanceVehicles: [{ id: 'v1', name: 'Click 02', status: 'In Progress', daysDown: 9 }],
  maintenancePartsCost: 1500,
  maintenanceLabourCost: 500,
  customerBreakdown: {
    byCountry: [{ country: 'Philippines', count: 40 }, { country: 'Unknown', count: 5 }, { country: 'Australia', count: 10 }],
    byContinent: [{ continent: 'Asia', count: 40 }, { continent: 'Oceania', count: 10 }],
  },
  expensesByCategory: [{ category: 'Fuel', total: 6000 }, { category: 'Maintenance - Parts', total: 1000 }],
  expensesByCategoryLastMonth: [{ category: 'Fuel', total: 3000 }],
  todayRevenue: 9000,
  miscSalesRevenue: 500,
  addonRevenue: [{ addonName: 'Surf rack', total: 300 }],
  cashBalances: [{ accountId: 'a', accountName: 'Cash drawer', balance: 15000 }],
  revenueTrend: [],
  revenueThisMonth: [],
  tomorrowAvailable: 4,
  bookingSourceSplit: { directWeb: 3, walkIn: 2, wooCommerce: 1, total: 6 },
  deviceSplit: { mobile: 4, desktop: 2, total: 6 },
};

const period = { revenue: 100_000, expenses: 40_000, profit: 60_000, bookings: 20, avgBookingValue: 5000 };
const insights = {
  today: '2026-11-14',
  rentableFleetSize: 20,
  mtd: { ...period, dayOfMonth: 14, lastMonth: { ...period, revenue: 80_000 } },
  monthly: [{ month: '2026-11', label: 'Nov 26', revenue: 100_000, expenses: 40_000, profit: 60_000 }],
  dailyRevenue: [{ day: 1, thisMonth: 5000, lastMonth: 4000 }],
  next7Days: [{ date: '2026-11-14', pickups: 3, returns: 2, onRent: 19, bookedPct: 95 }],
  weekdayDemand: [{ day: 'Sat', pickups: 30, avgPerWeek: 2.3 }],
};

const movements = {
  pickups: [{
    key: 'raw-r1', kind: 'raw', id: 'r1', storeId: 'store-lolas', reference: 'LR-1', customerName: 'Web Guest', mobile: null,
    time: '2026-11-14T09:00:00+08:00', until: '2026-11-16T09:00:00+08:00', vehicles: ['Honda Beat'], addons: ['Surf rack'],
    delivery: { place: 'Kalinaw Resort' }, collection: null, transfer: null, notes: null, balanceDue: null, quote: 2400,
    waiverSigned: null, partnerRef: null, status: 'to_activate', raw: { id: 'r1' },
  }],
  returns: [{
    key: 'ret-o1', orderId: 'o1', storeId: 'store-lolas', reference: 'LR-9', customerName: 'Ana', mobile: '+63917',
    time: '2026-11-14T21:00:00+08:00', vehicles: ['Beat 07'], helmetNumbers: '4, 5', collection: null, ninePm: true,
    balanceDue: 500, deposit: 1000, status: 'due',
  }],
};

const tomorrowMovements = {
  pickups: [{ ...movements.pickups[0], key: 'raw-r2', id: 'r2', customerName: 'Tomorrow Guest', time: '2026-11-15T10:00:00+08:00' }],
  returns: [],
};

const result = (data: unknown) => ({ data: mocks.withData ? data : undefined, isLoading: false, error: null });

vi.mock('../src/api/dashboard.js', () => ({
  useDashboardSummary: () => result({
    date: '2026-11-14', stores: { combined: metrics },
    activeOrdersCount: 12, revenueToday: 9000, cashupStatus: 'open', pendingInboxCount: 3, upcomingTransfersCount: 1, overdueOrdersCount: 2,
  }),
  useDashboardInsights: () => result(insights),
  useCharityImpact: () => result({
    openingBalance: 0, totalRaised: 400_000, totalDonated: 390_000, pendingPayout: 2000,
    bookingContributions: 90_000, annualCap: 100_000, annualDonated: 40_000,
  }),
  useReferralStats: () => result({
    total: 10,
    breakdown: [{ source: 'google', label: 'Google / Search engine', count: 6, percentage: 60 }, { source: 'accommodation', label: 'My hotel', count: 4, percentage: 40 }],
    accommodationBreakdown: [{ name: 'Surf Inn', count: 4 }],
    unmatchedRawNames: ['surf inn'],
  }),
  useBasketAbandonmentSummary: () => result({
    total: 50, basketViewed: 40, renterStarted: 20, converted: 6, abandoned: 30, conversionRate: 12, avgClicksCompleted: 9, avgClicksAbandoned: 4,
  }),
  usePartnerDashboardSummary: () => result({
    totalAttributedBookings: 3, totalCommission: 450,
    byPartner: [{ partnerId: 'p', partnerName: 'Surf Inn', slug: 'surf-inn', totalBookings: 3, commissionableBookings: 3, commissionDue: 450 }],
  }),
  useTodayMovements: (_storeId: string, day: string) => result(day === 'tomorrow' ? tomorrowMovements : movements),
  useChatSummary: () => result({
    total: 40, handoffs: 12, handoffRate: 30, avgMessages: 4,
    sessionsByDay: [{ date: '2026-11-13', sessions: 4 }], byPageOrigin: [{ page: 'home', count: 30 }],
    byDevice: [], topTopics: [{ topic: 'pricing', count: 10 }], topQuestions: [{ question: 'how much per day?', count: 5 }],
  }),
}));
vi.mock('../src/api/analytics.js', () => ({
  useAnalytics: () => result({
    period: { days: 30, from: '', to: '' },
    fleet: {
      byModel: [{
        modelId: 'beat', modelName: 'Honda Beat', currentFleetSize: 6, rentalDaysUsed: 150, availableFleetDays: 180,
        utilisationRate: 0.83, recommendedFleetSize: 7, fleetDelta: 1, avgRentalDuration: 4, revPAB: 450, extensionRate: 0.1, totalRentals: 30,
      }],
      overall: { utilisationRate: 0.7, revPAB: 420, extensionRate: 0.1, cancellationRate: 0.05, cancelledBookings: 1, bookingsPlaced: 20, totalRentals: 30 },
    },
    bookings: {
      leadTimeBuckets: { same_day: 1, one_to_three: 1, four_to_seven: 1, seven_plus: 1 },
      addonAttachRate: 0.4, repeatCustomerRate: 0.2, totalUniqueCustomers: 50, returningCustomers: 10, walkInShare: 0.3, walkInResponses: 10,
    },
    affiliates: { totalBookings: 0, attributedBookings: 0, attributedSharePct: 0, minBookingsForDailyAvg: 0, byPartner: [] },
    unmetDemand: { trackingSince: null, total: 0, website: 0, partnerPortal: 0, walkIn: 0, bookedAnyway: 0, byModel: [] },
  }),
}));
vi.mock('../src/api/config.js', () => ({ useStores: () => ({ data: [{ id: 'store-lolas', name: "Lola's" }] }) }));
vi.mock('../src/api/fleet.js', () => ({ usePartnerProtection: () => ({ data: [] }) }));
vi.mock('../src/api/lost-opportunity.js', () => ({
  useLostOpportunities: () => ({ data: mocks.withData ? [{ id: 1, estValue: 1200 }] : undefined }),
}));
vi.mock('../src/stores/ui-store.js', () => ({
  useUIStore: (selector: (s: unknown) => unknown) => selector({ selectedStoreId: 'all' }),
}));
vi.mock('../src/stores/auth-store.js', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ hasPermission: (p: string) => mocks.permissions.includes(p) }),
}));
vi.mock('../src/components/dashboard/AvailabilityDetailModal.js', () => ({ AvailabilityDetailModal: () => null }));
vi.mock('../src/components/dashboard/CharityDonationsModal.js', () => ({ CharityDonationsModal: () => null }));
vi.mock('../src/components/dashboard/AccommodationAliasModal.js', () => ({ AccommodationAliasModal: () => null }));
vi.mock('../src/api/orders.js', () => ({ useEnrichedOrders: () => ({ data: [] }) }));
vi.mock('../src/components/fleet/AvailabilityFinderModal.js', () => ({
  AvailabilityFinderModal: ({ storeId }: { storeId: string }) => <div>Finder for {storeId}</div>,
}));
vi.mock('../src/components/orders/BookingModal.js', () => ({
  BookingModal: ({ rawOrder }: { rawOrder: { id: string } }) => <div>Activating {rawOrder.id}</div>,
}));
vi.mock('../src/components/orders/OrderDetailModal.js', () => ({
  OrderDetailModal: ({ orderId }: { orderId: string }) => <div>Order {orderId}</div>,
}));

const { default: DashboardPage } = await import('../src/pages/dashboard/DashboardPage.js');

const OWNER = ['can_view_dashboard', 'can_view_lostopportunity', 'can_view_fleet'];

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  mocks.withData = true;
});

describe('dashboard tabs', () => {
  it('shows staff only the Today tab, without money figures', () => {
    mocks.permissions = [];
    renderAt('/dashboard?tab=business');
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getByText('Next 7 days')).toBeTruthy();
    expect(screen.queryByText('Revenue today')).toBeNull();
    expect(screen.getByText('2 overdue returns')).toBeTruthy();
  });

  it('lists what needs attention', () => {
    mocks.permissions = OWNER;
    renderAt('/dashboard');
    expect(screen.getByText('No vehicles available right now')).toBeTruthy();
    expect(screen.getByText('1 vehicle in maintenance over 7 days')).toBeTruthy();
    expect(screen.getByText('NGO payout pending ₱2,000')).toBeTruthy();
  });

  it("shows today's pickups and returns with their vitals, and opens the right modal", () => {
    mocks.permissions = ['can_view_inbox', 'can_view_active'];
    renderAt('/dashboard');
    expect(screen.getByText('Deliver to Kalinaw Resort')).toBeTruthy();
    expect(screen.getByText('Surf rack')).toBeTruthy();
    expect(screen.getByText('9PM return')).toBeTruthy();
    expect(screen.getByText('₱500 to collect')).toBeTruthy();
    fireEvent.click(screen.getByText('Web Guest'));
    expect(screen.getByText('Activating r1')).toBeTruthy();
    fireEvent.click(screen.getByText('Ana'));
    expect(screen.getByText('Order o1')).toBeTruthy();
  });

  it("switches a box to tomorrow's bookings", () => {
    mocks.permissions = ['can_view_inbox', 'can_view_active'];
    renderAt('/dashboard');
    fireEvent.click(screen.getAllByRole('button', { name: 'Tomorrow' })[0]);
    expect(screen.getByText('Pickups tomorrow')).toBeTruthy();
    expect(screen.getByText('Tomorrow Guest')).toBeTruthy();
    expect(screen.getByText('Returns today')).toBeTruthy();
  });

  it('opens the availability finder from the dashboard header', () => {
    mocks.permissions = ['can_view_fleet'];
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('button', { name: /Find availability/ }));
    expect(screen.getByText('Finder for store-lolas')).toBeTruthy();
  });

  it('hides the pickups and returns boxes from users without inbox or active access', () => {
    mocks.permissions = [];
    renderAt('/dashboard');
    expect(screen.queryByText('Pickups today')).toBeNull();
  });

  it('renders the Business tab with month-to-date figures and insights', () => {
    mocks.permissions = OWNER;
    renderAt('/dashboard?tab=business');
    expect(screen.getByRole('tab', { name: /Business/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Profit this month')).toBeTruthy();
    expect(screen.getByText('What the numbers say')).toBeTruthy();
    expect(screen.getByText('Revenue is 25% ahead of last month')).toBeTruthy();
    expect(screen.getByText('Honda Beat')).toBeTruthy();
  });

  it('renders the Marketing tab', () => {
    mocks.permissions = OWNER;
    renderAt('/dashboard?tab=marketing');
    expect(screen.getByText('How customers heard about us')).toBeTruthy();
    expect(screen.getByText('Website checkout funnel')).toBeTruthy();
    expect(screen.getByText('NGO impact')).toBeTruthy();
    expect(screen.queryByText('Unknown')).toBeNull();
  });

  it('switches tabs from the tab bar', () => {
    mocks.permissions = OWNER;
    renderAt('/dashboard');
    fireEvent.click(screen.getByRole('tab', { name: /Marketing/ }));
    expect(screen.getByText('How customers heard about us')).toBeTruthy();
  });

  it.each(['today', 'business', 'marketing'])('renders the %s tab while data is still loading', (tab) => {
    mocks.permissions = OWNER;
    mocks.withData = false;
    expect(() => renderAt(`/dashboard?tab=${tab}`)).not.toThrow();
  });
});
