import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AppRouter } from './router.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <AppRouter />
        </ErrorBoundary>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
