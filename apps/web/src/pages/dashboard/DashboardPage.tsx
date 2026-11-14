import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarPlus, Megaphone, Plus, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { AvailabilityFinderModal } from '../../components/fleet/AvailabilityFinderModal.js';
import { WalkInBookingModal } from '../../components/orders/WalkInBookingModal.js';
import { ReserveForLaterModal } from '../../components/orders/ReserveForLaterModal.js';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useStores } from '../../api/config.js';
import { DashboardTabs, type DashboardTab } from '../../components/dashboard/ui/index.js';
import TodayTab from './tabs/TodayTab.js';
import BusinessTab from './tabs/BusinessTab.js';
import MarketingTab from './tabs/MarketingTab.js';

type TabId = 'today' | 'business' | 'marketing';

const TABS: DashboardTab<TabId>[] = [
  { id: 'today', label: 'Today', icon: Activity },
  { id: 'business', label: 'Business', icon: TrendingUp },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
];

export interface DashboardTabProps {
  /** Store id for API calls; undefined means all stores combined. */
  storeId: string | undefined;
  /** Raw store selection from the header (may be '' or 'all'). */
  selectedStoreId: string;
  storeName: string;
}

export default function DashboardPage() {
  const selectedStoreId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: stores = [] } = useStores();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const refreshing = useIsFetching({ queryKey: ['dashboard'] }) > 0;
  const [finderStoreId, setFinderStoreId] = useState<string | null>(null);
  const [storePickerOpen, setStorePickerOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [reserveLaterOpen, setReserveLaterOpen] = useState(false);

  const canViewOwnerTabs = hasPermission('can_view_dashboard');
  const requested = searchParams.get('tab') as TabId | null;
  const tab: TabId =
    canViewOwnerTabs && requested && TABS.some((t) => t.id === requested) ? requested : 'today';

  const storeId = selectedStoreId && selectedStoreId !== 'all' ? selectedStoreId : undefined;
  const storeName = storeId
    ? (stores as Array<{ id: string; name: string }>).find((s) => s.id === storeId)?.name ?? storeId
    : 'All stores';

  const todayLabel = new Date().toLocaleDateString('en-GB', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const changeTab = (next: TabId) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'today') params.delete('tab');
    else params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  const tabProps: DashboardTabProps = { storeId, selectedStoreId, storeName };

  // The booking modals book against the store picked in the header, so they need a single store.
  const canReserve = hasPermission('can_edit_orders') && !!storeId;
  const closeAndRefresh = (close: () => void) => () => {
    close();
    refresh();
  };

  const canFindAvailability = hasPermission('can_view_fleet') || hasPermission('can_view_inbox');
  const finderStores = storeId
    ? [{ id: storeId, name: storeName }]
    : (stores as Array<{ id: string; name: string }>).filter((s) => s.id !== 'company');

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {storeName} &middot; {todayLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canViewOwnerTabs && <DashboardTabs tabs={TABS} active={tab} onChange={changeTab} />}
          {canFindAvailability && (
            <div className="relative">
              <button
                type="button"
                onClick={() => (finderStores.length === 1 ? setFinderStoreId(finderStores[0].id) : setStorePickerOpen((o) => !o))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-brand/30 bg-white px-3 py-2 text-sm font-medium text-teal-brand shadow-sm hover:bg-teal-brand/5"
              >
                <Search className="h-4 w-4" />
                Find availability
              </button>
              {storePickerOpen && (
                <div className="absolute right-0 z-20 mt-1 w-48 rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                  <p className="px-3 py-1.5 text-xs text-gray-400">Which store?</p>
                  {finderStores.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStorePickerOpen(false);
                        setFinderStoreId(s.id);
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {canReserve && (
            <>
              <button
                type="button"
                onClick={() => setReserveLaterOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-brand/30 bg-white px-3 py-2 text-sm font-medium text-teal-brand shadow-sm hover:bg-teal-brand/5"
              >
                <CalendarPlus className="h-4 w-4" />
                Reserve for later
              </button>
              <button
                type="button"
                onClick={() => setWalkInOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-teal-brand px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-brand/90"
              >
                <Plus className="h-4 w-4" />
                Walk-in now
              </button>
            </>
          )}
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50"
            title="Reload the latest numbers"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {tab === 'today' && <TodayTab {...tabProps} />}
      {tab === 'business' && <BusinessTab {...tabProps} />}
      {tab === 'marketing' && <MarketingTab {...tabProps} />}

      {finderStoreId && <AvailabilityFinderModal open onClose={() => setFinderStoreId(null)} storeId={finderStoreId} />}
      {walkInOpen && <WalkInBookingModal open onClose={closeAndRefresh(() => setWalkInOpen(false))} />}
      {reserveLaterOpen && <ReserveForLaterModal open onClose={closeAndRefresh(() => setReserveLaterOpen(false))} />}
    </div>
  );
}
