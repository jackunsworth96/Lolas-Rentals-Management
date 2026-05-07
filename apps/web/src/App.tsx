import { useState, useMemo, useCallback } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';
import { BetaErrorBanner } from './components/common/BetaErrorBanner.js';
import { ScrollToTop } from './components/ui/ScrollToTop.js';
import { useFavicon } from './hooks/useFavicon.js';
import { DeliveryReminderModal } from './components/orders/DeliveryReminderModal.js';

function FaviconSwitcher() {
  useFavicon();
  return null;
}

/** Set VITE_BETA_ERROR_NOTICE=true to show the WhatsApp error banner on all errors.
 *  Remove or set to false once the site is stable. */
const BETA_ERROR_NOTICE = import.meta.env.VITE_BETA_ERROR_NOTICE === 'true';

export function App() {
  const [showBetaError, setShowBetaError] = useState(false);

  const triggerBetaError = useCallback(() => {
    if (BETA_ERROR_NOTICE) setShowBetaError(true);
  }, []);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        mutationCache: new MutationCache({ onError: triggerBetaError }),
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
    [triggerBetaError],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <FaviconSwitcher />
        <ScrollToTop />
        <ErrorBoundary onError={triggerBetaError}>
          <AppRouter />
        </ErrorBoundary>
        <DeliveryReminderModal />
        {BETA_ERROR_NOTICE && showBetaError && (
          <BetaErrorBanner onClose={() => setShowBetaError(false)} />
        )}
      </BrowserRouter>
    </QueryClientProvider>
  );
}
