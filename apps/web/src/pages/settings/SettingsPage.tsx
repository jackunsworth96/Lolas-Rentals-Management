import { useSearchParams } from 'react-router-dom';
import { visibleSettingsSections, type SettingsTabKey } from './settings-tabs.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { StoresTab } from '../../components/settings/tabs/StoresTab.js';
import { UsersTab } from '../../components/settings/tabs/UsersTab.js';
import { RolesTab } from '../../components/settings/access/RolesTab.js';
import { PeopleAccessTab } from '../../components/settings/access/PeopleAccessTab.js';
import { AccessHistoryTab } from '../../components/settings/access/AccessHistoryTab.js';
import { AddonsTab } from '../../components/settings/tabs/AddonsTab.js';
import { LocationsTab } from '../../components/settings/tabs/LocationsTab.js';
import { PaymentMethodsTab } from '../../components/settings/tabs/PaymentMethodsTab.js';
import { VehicleModelsTab } from '../../components/settings/tabs/VehicleModelsTab.js';
import { ExpenseCategoriesTab } from '../../components/settings/tabs/ExpenseCategoriesTab.js';
import { TransferRoutesTab } from '../../components/settings/tabs/TransferRoutesTab.js';
import { ChartOfAccountsTab } from '../../components/settings/tabs/ChartOfAccountsTab.js';
import { PawCardTab } from '../../components/settings/tabs/PawCardTab.js';
import { DayTypesTab } from '../../components/settings/tabs/DayTypesTab.js';
import { LeaveConfigTab } from '../../components/settings/tabs/LeaveConfigTab.js';
import { FleetStatusesTab } from '../../components/settings/tabs/FleetStatusesTab.js';
import { PaymentRoutingTab } from '../../components/settings/tabs/PaymentRoutingTab.js';
import { TaskCategoriesTab } from '../../components/settings/tabs/TaskCategoriesTab.js';
import { MaintenancePartsTab } from '../../components/settings/tabs/MaintenancePartsTab.js';
import { RepairCostsTab } from '../../components/settings/tabs/RepairCostsTab.js';
import { ReviewsTab } from '../../components/settings/tabs/ReviewsTab.js';
import { InspectionChecklistTab } from '../../components/settings/tabs/InspectionChecklistTab.js';
import { PickupRulesTab } from '../../components/settings/tabs/PickupRulesTab.js';
import { FleetAccountingTab } from '../../components/settings/tabs/FleetAccountingTab.js';
import { AccommodationDirectoryTab } from '../../components/settings/tabs/AccommodationDirectoryTab.js';
import { InvoicesTab } from '../../components/settings/tabs/InvoicesTab.js';

const TAB_COMPONENT: Record<SettingsTabKey, React.FC> = {
  stores: StoresTab,
  users: UsersTab,
  roles: RolesTab,
  people: PeopleAccessTab,
  'access-history': AccessHistoryTab,
  addons: AddonsTab,
  locations: LocationsTab,
  'accommodation-directory': AccommodationDirectoryTab,
  'payment-methods': PaymentMethodsTab,
  'vehicle-models': VehicleModelsTab,
  'fleet-statuses': FleetStatusesTab,
  'expense-categories': ExpenseCategoriesTab,
  'task-categories': TaskCategoriesTab,
  'maintenance-parts': MaintenancePartsTab,
  'repair-costs': RepairCostsTab,
  reviews: ReviewsTab,
  'inspection-checklist': InspectionChecklistTab,
  'transfer-routes': TransferRoutesTab,
  'pickup-rules': PickupRulesTab,
  'chart-of-accounts': ChartOfAccountsTab,
  'payment-routing': PaymentRoutingTab,
  invoices: InvoicesTab,
  'fleet-accounting': FleetAccountingTab,
  'paw-card': PawCardTab,
  'day-types': DayTypesTab,
  'leave-config': LeaveConfigTab,
};

const EMPTY: string[] = [];

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const perms = useAuthStore((s) => s.user?.permissions ?? EMPTY);
  const sections = visibleSettingsSections(perms);
  const tabs = sections.flatMap((s) => s.tabs as ReadonlyArray<{ key: SettingsTabKey; label: string }>);
  const requested = searchParams.get('tab');
  const activeTab = tabs.find((t) => t.key === requested)?.key ?? tabs[0]?.key;
  const setActiveTab = (key: SettingsTabKey) => setSearchParams({ tab: key });

  if (!activeTab) return null;
  const ActiveComponent = TAB_COMPONENT[activeTab];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      <div className="md:hidden">
        <h1 className="mb-3 text-2xl font-bold text-gray-900">Settings</h1>
        <select
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value as SettingsTabKey)}
          aria-label="Settings section"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800"
        >
          {sections.map((section) => (
            <optgroup key={section.label} label={section.label}>
              {section.tabs.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <nav className="hidden w-56 shrink-0 md:block">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Settings</h1>
        {sections.map((section) => (
          <div key={section.label} className="mb-3">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              {section.label}
            </p>
            <ul className="space-y-0.5">
              {section.tabs.map((tab) => (
                <li key={tab.key}>
                  <button
                    onClick={() => setActiveTab(tab.key)}
                    className={`w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                      activeTab === tab.key
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
