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
const BudgetPage = lazy(() => import('./pages/budget/BudgetPage.js'));
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
const PawCardPartnersPage = lazy(() => import('./pages/paw-card/PawCardPartnersPage.js'));
const BrowseBookPage = lazy(() => import('./pages/booking/BrowseBookPage.js'));
const BasketPage = lazy(() => import('./pages/basket/BasketPage.js'));
const ConfirmationPage = lazy(() => import('./pages/confirmation/ConfirmationPage.js'));
const ExtendPage = lazy(() => import('./pages/extend/ExtendPage.js'));
const HomePage = lazy(() => import('./pages/home/HomePage.js'));
const TransferBookingPage = lazy(() => import('./pages/TransferBookingPage.js'));
const RepairsPage = lazy(() => import('./pages/repairs/RepairsPage.js'));
const AboutPage = lazy(() => import('./pages/about/AboutPage.js'));
const PrivacyPage = lazy(() => import('./pages/privacy/PrivacyPage.js'));
const UIErrorsPage = lazy(() => import('./pages/ui-errors/UIErrorsPage.js'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.js'));
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage.js'));
const WaiverPage = lazy(() => import('./pages/waiver/WaiverPage.js'));
const WaiverAgreementPage = lazy(() => import('./pages/waiver/WaiverAgreementPage.js'));
const RefundPolicyPage = lazy(() => import('./pages/legal/RefundPolicyPage.js'));
const PeaceOfMindPage = lazy(() => import('./pages/peace-of-mind/PeaceOfMindPage.js'));
const BePawsitivePage = lazy(() => import('./pages/bepawsitive/BePawsitivePage.js'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireFleetBookValue({ children }: { children: React.ReactNode }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (!hasPermission('can_view_fleet_book_value')) return <Navigate to="/fleet" replace />;
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
        {/* Root redirects to customer homepage */}
        <Route path="/" element={<Navigate to="/book" replace />} />
        <Route path="/login" element={<LoginPage />} />

        {/* Customer-facing routes — all under /book */}
        <Route path="/book" element={<HomePage />} />
        <Route path="/book/reserve" element={<BrowseBookPage />} />
        <Route path="/book/basket" element={<BasketPage />} />
        <Route path="/book/confirmation" element={<ConfirmationPage />} />
        <Route path="/book/confirmation/:reference" element={<ConfirmationPage />} />
        <Route path="/book/extend" element={<ExtendPage />} />
        <Route path="/book/paw-card" element={<PawCardPage />} />
        <Route path="/paw-card/partners" element={<PawCardPartnersPage />} />
        <Route path="/book/transfers" element={<TransferBookingPage />} />
        <Route path="/book/repairs" element={<RepairsPage />} />
        <Route path="/book/about" element={<AboutPage />} />
        <Route path="/book/privacy" element={<PrivacyPage />} />
        <Route path="/book/waiver-agreement" element={<WaiverAgreementPage />} />
        <Route path="/book/transfer/:token" element={<PublicBookingPage />} />
        <Route path="/waiver/:orderReference" element={<WaiverPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/peace-of-mind" element={<PeaceOfMindPage />} />
        <Route path="/book/bepawsitive" element={<BePawsitivePage />} />

        {/* Backoffice routes — protected */}
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="orders/inbox" element={<InboxPage />} />
          <Route path="orders/active" element={<ActivePage />} />
          <Route path="orders/completed" element={<CompletedPage />} />
          <Route path="fleet" element={<FleetPage />} />
          <Route
            path="fleet/utilization"
            element={
              <RequireFleetBookValue>
                <UtilizationDashboard />
              </RequireFleetBookValue>
            }
          />
          <Route path="maintenance" element={<MaintenancePage />} />
          <Route path="transfers" element={<TransfersPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="accounts/:id" element={<AccountDetailPage />} />
          <Route path="budget" element={<BudgetPage />} />
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
          <Route path="directory" element={<DirectoryPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
