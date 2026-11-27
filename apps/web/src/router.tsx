import { Routes, Route, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ChunkErrorBoundary } from './components/ChunkErrorBoundary.js';
import { AppLayout } from './components/layout/AppLayout.js';
import { isCounterOnlyUser, useAuthStore } from './stores/auth-store.js';
import { usePartnerAuthStore } from './stores/partner-auth-store.js';
import { usePartnerKioskStore } from './api/partner-kiosk.js';
import { Permission } from '@lolas/shared';
import { RequirePermission } from './components/auth/RequirePermission.js';
import type { BackofficePath } from './lib/route-permissions.js';

const LoginPage = lazy(() => import('./pages/login/LoginPage.js'));
const InboxPage = lazy(() => import('./pages/orders/InboxPage.js'));
const ActivePage = lazy(() => import('./pages/orders/ActivePage.js'));
const CompletedPage = lazy(() => import('./pages/orders/CompletedPage.js'));
const FleetPage = lazy(() => import('./pages/fleet/FleetPage.js'));
const UtilizationDashboard = lazy(() => import('./pages/fleet/UtilizationDashboard.js'));
const AssetRegisterPage = lazy(() => import('./pages/fleet/AssetRegisterPage.js'));
const AccidentsPage = lazy(() => import('./pages/fleet/AccidentsPage.js'));
const BreakdownsPage = lazy(() => import('./pages/fleet/BreakdownsPage.js'));
const MaintenancePage = lazy(() => import('./pages/maintenance/MaintenancePage.js'));
const TransfersPage = lazy(() => import('./pages/transfers/TransfersPage.js'));
const PublicBookingPage = lazy(() => import('./pages/transfers/PublicBookingPage.js'));
const AccountsPage = lazy(() => import('./pages/accounting/AccountsPage.js'));
const BudgetPage = lazy(() => import('./pages/budget/BudgetPage.js'));
const AccountDetailPage = lazy(() => import('./pages/accounting/AccountDetailPage.js'));
const ManualJournalPage = lazy(() => import('./pages/accounting/ManualJournalPage.js'));
const VehicleOwnerStatementPage = lazy(() => import('./pages/accounting/VehicleOwnerStatementPage.js'));
const CardSettlementsPage = lazy(() => import('./pages/card-settlements/CardSettlementsPage.js'));
const CashupPage = lazy(() => import('./pages/cashup/CashupPage.js'));
const EmployeesPage = lazy(() => import('./pages/hr/EmployeesPage.js'));
const TimesheetsPage = lazy(() => import('./pages/hr/TimesheetsPage.js'));
const PayrollPage = lazy(() => import('./pages/hr/PayrollPage.js'));
const RotaPage = lazy(() => import('./pages/hr/RotaPage.js'));
const MyPortalPage = lazy(() => import('./pages/me/MyPortalPage.js'));
const ExpensesPage = lazy(() => import('./pages/expenses/ExpensesPage.js'));
const TodoPage = lazy(() => import('./pages/todo/TodoPage.js'));
const MiscSalesPage = lazy(() => import('./pages/misc-sales/MiscSalesPage.js'));
const MerchandisePage = lazy(() => import('./pages/merchandise/MerchandisePage.js'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage.js'));
const PawCardPartnersPage = lazy(() => import('./pages/paw-card/PawCardPartnersPage.js'));
const BrowseBookPage = lazy(() => import('./pages/booking/BrowseBookPage.js'));
const BasketPage = lazy(() => import('./pages/basket/BasketPage.js'));
const ConfirmationPage = lazy(() => import('./pages/confirmation/ConfirmationPage.js'));
const ExtendPage = lazy(() => import('./pages/extend/ExtendPage.js'));
const ExtensionPaymentPage = lazy(() => import('./pages/extend/ExtensionPaymentPage.js'));
const HomePage = lazy(() => import('./pages/home/HomePage.js'));
const TransferBookingPage = lazy(() => import('./pages/TransferBookingPage.js'));
const RepairsPage = lazy(() => import('./pages/repairs/RepairsPage.js'));
const AboutPage = lazy(() => import('./pages/about/AboutPage.js'));
const PrivacyPage = lazy(() => import('./pages/privacy/PrivacyPage.js'));
const TermsPage = lazy(() => import('./pages/terms/TermsPage.js'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage.js'));
const DirectoryPage = lazy(() => import('./pages/directory/DirectoryPage.js'));
const WaiverPage = lazy(() => import('./pages/waiver/WaiverPage.js'));
const WaiverAgreementPage = lazy(() => import('./pages/waiver/WaiverAgreementPage.js'));
const RefundPolicyPage = lazy(() => import('./pages/legal/RefundPolicyPage.js'));
const PeaceOfMindPage = lazy(() => import('./pages/peace-of-mind/PeaceOfMindPage.js'));
const BePawsitivePage = lazy(() => import('./pages/bepawsitive/BePawsitivePage.js'));
const EcoHubSiargaoPage = lazy(() => import('./pages/eco-hub-siargao/EcoHubSiargaoPage.js'));
const ImpactPage = lazy(() => import('./pages/impact/ImpactPage.js'));
const ImpactArticlePage = lazy(() => import('./pages/impact/ImpactArticlePage.js'));
const ImpactAdminPage = lazy(() => import('./pages/impact-admin/ImpactAdminPage.js'));
const CancelBookingPage = lazy(() => import('./pages/cancel/CancelBookingPage.js'));
const NotFoundPage = lazy(() => import('./pages/not-found/NotFoundPage.js'));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage.js'));
const UnsubscribePage = lazy(() => import('./pages/unsubscribe/UnsubscribePage.js'));
const PartnersPage = lazy(() => import('./pages/partners/PartnersPage.js'));
const PartnerUtilizationPage = lazy(() => import('./pages/partners/PartnerUtilizationPage.js'));
const AnalyticsPage = lazy(() => import('./pages/analytics/AnalyticsPage.js'));
const AffiliatesPage = lazy(() => import('./pages/affiliates/AffiliatesPage.js'));
const AffiliatesDetailsPage = lazy(() => import('./pages/affiliates/AffiliatesDetailsPage.js'));
const PartnerLoginPage = lazy(() => import('./pages/partner/PartnerLoginPage.js'));
const PartnerShell = lazy(() => import('./pages/partner/PartnerShell.js'));
const PartnerDashboardPage = lazy(() => import('./pages/partner/PartnerDashboardPage.js'));
const PartnerBookPage = lazy(() => import('./pages/partner/PartnerBookPage.js'));
const PartnerReportsPage = lazy(() => import('./pages/partner/PartnerReportsPage.js'));
const PartnerPricesPage = lazy(() => import('./pages/partner/PartnerPricesPage.js'));
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage.js'));
const ContractsPage = lazy(() => import('./pages/contracts/ContractsPage.js'));
const PublicContractPage = lazy(() => import('./pages/contract/PublicContractPage.js'));
const CounterPage = lazy(() => import('./pages/counter/CounterPage.js'));
const PartnerKioskPage = lazy(() => import('./pages/partner/PartnerKioskPage.js'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const counterOnly = useAuthStore((s) => isCounterOnlyUser(s.user));
  if (!token) return <Navigate to="/login" replace />;
  if (counterOnly) return <Navigate to="/counter" replace />;
  return <>{children}</>;
}

function CounterRoute() {
  const token = useAuthStore((s) => s.token);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  if (!token) return <Navigate to="/login" replace />;
  if (!hasPermission(Permission.UseCounter)) return <Navigate to="/dashboard" replace />;
  return <CounterPage />;
}

const BACKOFFICE_ROUTES: ReadonlyArray<readonly [Exclude<BackofficePath, '/counter'>, React.ComponentType]> = [
  ['/dashboard', DashboardPage],
  ['/orders/inbox', InboxPage],
  ['/orders/active', ActivePage],
  ['/orders/completed', CompletedPage],
  ['/invoices', InvoicesPage],
  ['/fleet', FleetPage],
  ['/fleet/utilization', UtilizationDashboard],
  ['/fleet/asset-register', AssetRegisterPage],
  ['/fleet/accidents', AccidentsPage],
  ['/fleet/breakdowns', BreakdownsPage],
  ['/maintenance', MaintenancePage],
  ['/transfers', TransfersPage],
  ['/accounts', AccountsPage],
  ['/accounts/vehicle-owners', VehicleOwnerStatementPage],
  ['/accounts/:id', AccountDetailPage],
  ['/journal', ManualJournalPage],
  ['/budget', BudgetPage],
  ['/card-settlements', CardSettlementsPage],
  ['/cashup', CashupPage],
  ['/hr/employees', EmployeesPage],
  ['/hr/timesheets', TimesheetsPage],
  ['/hr/payroll', PayrollPage],
  ['/hr/rota', RotaPage],
  ['/me', MyPortalPage],
  ['/expenses', ExpensesPage],
  ['/todo', TodoPage],
  ['/misc-sales', MiscSalesPage],
  ['/merchandise', MerchandisePage],
  ['/settings', SettingsPage],
  ['/directory', DirectoryPage],
  ['/customers', CustomersPage],
  ['/partners', PartnersPage],
  ['/partners/utilization', PartnerUtilizationPage],
  ['/contracts', ContractsPage],
  ['/analytics', AnalyticsPage],
  ['/impact', ImpactAdminPage],
];

function ProtectedPartnerRoute({ children }: { children: React.ReactNode }) {
  const token = usePartnerAuthStore((s) => s.token);
  const kioskToken = usePartnerKioskStore((s) => s.token);
  if (kioskToken) return <Navigate to="/partner/kiosk" replace />;
  if (!token) return <Navigate to="/partner/login" replace />;
  return <>{children}</>;
}

const Loading = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
  </div>
);

export function AppRouter() {
  return (
    <ChunkErrorBoundary>
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Root redirects to customer homepage */}
          <Route path="/" element={<Navigate to="/book" replace />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/counter" element={<CounterRoute />} />

          {/* Customer-facing routes — all under /book */}
          <Route path="/book" element={<HomePage />} />
          <Route path="/book/reserve" element={<BrowseBookPage />} />
          <Route path="/book/basket" element={<BasketPage />} />
          <Route path="/book/confirmation" element={<ConfirmationPage />} />
          <Route path="/book/confirmation/:reference" element={<ConfirmationPage />} />
          <Route path="/book/extend" element={<ExtendPage />} />
          <Route path="/book/extend/pay" element={<ExtensionPaymentPage />} />
          <Route path="/book/paw-card" element={<Navigate to="/paw-card/partners" replace />} />
          <Route path="/paw-card/partners" element={<PawCardPartnersPage />} />
          <Route path="/book/transfers" element={<TransferBookingPage />} />
          <Route path="/book/repairs" element={<RepairsPage />} />
          <Route path="/book/about" element={<AboutPage />} />
          <Route path="/book/privacy" element={<PrivacyPage />} />
          <Route path="/book/terms" element={<TermsPage />} />
          <Route path="/book/waiver-agreement" element={<WaiverAgreementPage />} />
          <Route path="/book/transfer/:token" element={<PublicBookingPage />} />
          <Route path="/waiver/:orderReference" element={<WaiverPage />} />
          <Route path="/contract/:token" element={<PublicContractPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/peace-of-mind" element={<PeaceOfMindPage />} />
          <Route path="/book/bepawsitive" element={<BePawsitivePage />} />
          <Route path="/book/eco-hub-siargao" element={<EcoHubSiargaoPage />} />
          <Route path="/book/impact" element={<ImpactPage />} />
          <Route path="/book/impact/:slug" element={<ImpactArticlePage />} />
          <Route path="/book/cancel/:orderReference" element={<CancelBookingPage />} />
          <Route path="/unsubscribe" element={<UnsubscribePage />} />
          <Route path="/affiliates" element={<AffiliatesPage />} />
          <Route path="/affiliates/details/:partnerId" element={<AffiliatesDetailsPage />} />
          <Route path="/partner" element={<Navigate to="/partner/dashboard" replace />} />
          <Route path="/partner/login" element={<PartnerLoginPage />} />
          <Route path="/partner/kiosk" element={<PartnerKioskPage />} />
          <Route element={<ProtectedPartnerRoute><PartnerShell /></ProtectedPartnerRoute>}>
            <Route path="/partner/dashboard" element={<PartnerDashboardPage />} />
            <Route path="/partner/book" element={<PartnerBookPage />} />
            <Route path="/partner/prices" element={<PartnerPricesPage />} />
            <Route path="/partner/reports" element={<PartnerReportsPage />} />
          </Route>

          {/* Backoffice routes — protected; page permissions come from lib/route-permissions.ts */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            {BACKOFFICE_ROUTES.map(([path, Page]) => (
              <Route
                key={path}
                path={path.slice(1)}
                element={<RequirePermission path={path}><Page /></RequirePermission>}
              />
            ))}
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </ChunkErrorBoundary>
  );
}
