import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { usePartnerLogin } from '../../api/partner-portal.js';
import { fetchPublicPartnerBenefit } from '../../api/partners.js';
import { usePartnerAuthStore } from '../../stores/partner-auth-store.js';
import { partnerSlugFromUrl } from '../../utils/partnerHost.js';
import lolaLogo from '../../assets/Lolas Original Logo.svg';

export default function PartnerLoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const login = usePartnerLogin();
  const setPartnerAuth = usePartnerAuthStore((s) => s.setPartnerAuth);
  const partnerSlug = useMemo(() => partnerSlugFromUrl() ?? '', []);
  const { data: partnerBenefit } = useQuery({
    queryKey: ['partner-login-benefit', partnerSlug],
    queryFn: () => fetchPublicPartnerBenefit(partnerSlug),
    enabled: !!partnerSlug,
    staleTime: 5 * 60_000,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!partnerSlug) {
      setError('Partner link is missing. Please use your partner portal link.');
      return;
    }
    try {
      const result = await login.mutateAsync({ partnerSlug, username, pin });
      setPartnerAuth(result.token, result.user);
      navigate('/partner/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-teal-50 px-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
        <div className="mb-6 flex items-center justify-center gap-4">
          <img src={lolaLogo} alt="Lola's Rentals" className="h-14 w-auto" />
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
        <h1 className="text-center text-xl font-bold text-gray-900">Partner Portal</h1>
        <p className="mt-1 text-center text-sm text-gray-500">{partnerSlug || 'Partner'} staff login</p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Username</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">PIN / Password</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" type="password" value={pin} onChange={(e) => setPin(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={login.isPending} className="w-full rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {login.isPending ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
