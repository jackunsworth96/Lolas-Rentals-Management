import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { api } from '../../api/client.js';
import { Button } from '../../components/common/Button.js';
import { fetchPublicPartnerBenefit } from '../../api/partners.js';
import { partnerSlugFromUrl } from '../../utils/partnerHost.js';
import { DEFAULT_STORE_ID } from '@lolas/shared';
import lolaLogo from '../../assets/Lolas Original Logo.svg';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSelectedStore = useUIStore((s) => s.setSelectedStore);
  const navigate = useNavigate();
  const partnerSlug = useMemo(() => partnerSlugFromUrl() ?? '', []);
  const { data: partnerBenefit } = useQuery({
    queryKey: ['backoffice-login-partner-benefit', partnerSlug],
    queryFn: () => fetchPublicPartnerBenefit(partnerSlug),
    enabled: !!partnerSlug,
    staleTime: 5 * 60_000,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ token: string; user: { storeIds?: string[] } }>('/auth/login', { username, pin });
      setAuth(result.token, result.user);
      setSelectedStore(DEFAULT_STORE_ID);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-8 flex items-center justify-center gap-4">
          <img src={lolaLogo} alt="Lola's Rentals" className="h-16 w-auto" />
          {partnerBenefit?.logoUrl && (
            <>
              <span className="h-10 w-px bg-gray-200" aria-hidden="true" />
              <img
                src={partnerBenefit.logoUrl}
                alt={partnerBenefit.name}
                className="max-h-14 max-w-32 object-contain"
                style={{
                  maxWidth: partnerBenefit.logoDisplayWidth ?? undefined,
                  maxHeight: partnerBenefit.logoDisplayHeight ?? undefined,
                }}
              />
            </>
          )}
        </div>
        <p className="mb-8 -mt-4 text-center text-sm text-gray-500">Sign in to the backoffice</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">PIN</label>
            <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} required inputMode="text" autoComplete="current-password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Sign in</Button>
        </form>
      </div>
    </div>
  );
}
