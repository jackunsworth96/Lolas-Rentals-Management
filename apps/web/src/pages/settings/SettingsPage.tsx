import { useState } from 'react';
import { StoresTab } from '../../components/settings/tabs/StoresTab.js';
import { UsersTab } from '../../components/settings/tabs/UsersTab.js';
import { RolesTab } from '../../components/settings/tabs/RolesTab.js';
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

const TABS = [
  { key: 'stores', label: 'Stores' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles & Permissions' },
  { key: 'addons', label: 'Add-ons' },
  { key: 'locations', label: 'Locations' },
  { key: 'payment-methods', label: 'Payment Methods' },
  { key: 'vehicle-models', label: 'Vehicle Models' },
  { key: 'fleet-statuses', label: 'Fleet Statuses' },
  { key: 'expense-categories', label: 'Expense Categories' },
  { key: 'task-categories', label: 'Task Categories' },
  { key: 'maintenance-parts', label: 'Maintenance Parts' },
  { key: 'repair-costs', label: 'Repair Costs' },
  { key: 'transfer-routes', label: 'Transfer Routes' },
  { key: 'chart-of-accounts', label: 'Chart of Accounts' },
  { key: 'payment-routing', label: 'Payment Routing' },
  { key: 'paw-card', label: 'Paw Card Establishments' },
  { key: 'day-types', label: 'Day Types' },
  { key: 'leave-config', label: 'Leave Config' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const TAB_COMPONENT: Record<TabKey, React.FC> = {
  stores: StoresTab,
  users: UsersTab,
  roles: RolesTab,
  addons: AddonsTab,
  locations: LocationsTab,
  'payment-methods': PaymentMethodsTab,
  'vehicle-models': VehicleModelsTab,
  'fleet-statuses': FleetStatusesTab,
  'expense-categories': ExpenseCategoriesTab,
  'task-categories': TaskCategoriesTab,
  'maintenance-parts': MaintenancePartsTab,
  'repair-costs': RepairCostsTab,
  'transfer-routes': TransferRoutesTab,
  'chart-of-accounts': ChartOfAccountsTab,
  'payment-routing': PaymentRoutingTab,
  'paw-card': PawCardTab,
  'day-types': DayTypesTab,
  'leave-config': LeaveConfigTab,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('stores');
  const ActiveComponent = TAB_COMPONENT[activeTab];

  return (
    <div className="flex gap-6">
      <nav className="w-56 shrink-0">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Settings</h1>
        <ul className="space-y-1">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <button
                onClick={() => setActiveTab(tab.key)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
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
      </nav>
      <div className="min-w-0 flex-1">
        <div className="rounded-lg bg-white p-6 shadow-sm">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
