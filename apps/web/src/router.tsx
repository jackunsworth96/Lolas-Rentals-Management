import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppLayout } from './components/layout/AppLayout.js';
import { useAuthStore } from './stores/auth-store.js';

const LoginPage = lazy(() => import('./pages/login/LoginPage.js'));
const InboxPage = lazy(() => import('./pages/orders/InboxPage.js'));
const ActivePage = lazy(() => import('./pages/orders/ActivePage.js'));
const CompletedPage = lazy(() => import('./pages/orders/CompletedPage.js'));
const FleetPage = lazy(() => import('./pages/fleet/FleetPage.js'));
const UtilizationDashboard = lazy(() => import('./pages/fleet/UtilizationDashboard.js'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage.js'));
const TransfersPage = lazy(() => import('./pages/transfers/TransfersPage.js'));
const PublicBookingPage = lazy(() => import('./pages/transfers/PublicBookingPage.js'));
const AccountsPage = lazy(() => import('./pages/accounting/AccountsPage.js'));
const AccountDetailPage = lazy(() => import('./pages/accounting/AccountDetailPage.js'));
const CardSettlementsPage = lazy(() => import('./pages/card-settlements/CardSettlementsPage.js'));
const CashupPage = lazy(() => import('./pages/cashup/CashupPage.js'));
const EmployeesPage = lazy(() => import('./pages/hr/EmployeesPage.js'));
const TimesheetsPage = lazy(() => import('./pages/hr/TimesheetsPage.js'));
const PayrollPage = lazy(() => import('./pages/hr/PayrollPage.js'));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage.js'));
const TodoPage = lazy(() => import('./pages/todo/TodoPage.js'));
const MiscSalesPage = lazy(() => import('./pages/misc-sales/MiscSalesPage.js'));
const MerchandisePage = lazy(() => import('./pages/merchandise/MerchandisePage.js'));
const LostOpportunityPage = lazy(() => import('./pages/lost-opportunity/LostOpportunityPage.js'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage.js'));
const PawCardPage = lazy(() => import('./pages/paw-card/PawCardPage.js'));
const BrowseBookPage = lazy(() => import('./pages/booking/BrowseBookPage.js'));
const UIErrorsPage = lazy(() => import('./pages/ui-errors/UIErrorsPage.js'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
  </div>
);

export function AppRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/book-transfer/:token" element={<PublicBookingPage />} />
        <Route path="/paw-card" element={<PawCardPage />} />
        <Route path="/browse-book" element={<BrowseBookPage />} />
        <Route path="/basket" element={<BrowseBookPage />} />

        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/orders/inbox" replace />} />
          <Route path="orders/inbox" element={<InboxPage />} />
          <Route path="orders/active" element={<ActivePage />} />
          <Route path="orders/completed" element={<CompletedPage />} />
          <Route path="fleet" element={<FleetPage />} />
          <Route path="fleet/utilization" element={<UtilizationDashboard />} />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />
          <Route path="card-settlements" element={<CardSettlementsPage />} />
          <Route path="cashup" element={<CashupPage />} />
          <Route path="hr/employees" element={<EmployeesPage />} />
          <Route path="hr/timesheets" element={<TimesheetsPage />} />
          <Route path="hr/payroll" element={<PayrollPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="todo" element={<TodoPage />} />
          <Route path="misc-sales" element={<MiscSalesPage />} />
          <Route path="merchandise" element={<MerchandisePage />} />
          <Route path="lost-opportunity" element={<LostOpportunityPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="ui-errors" element={<UIErrorsPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
