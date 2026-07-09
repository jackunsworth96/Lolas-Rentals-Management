import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/auth-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { api } from '../../api/client.js';
import { Button } from '../../components/common/Button.js';
import lolaLogo from '../../assets/Lolas Original Logo.svg';
import bassLogo from '../../assets/BASS Logo .svg';

function affiliateLogoFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const affiliate = (params.get('affiliate') ?? params.get('brand') ?? '').toLowerCase();
  const hostLabel = window.location.hostname.split('.')[0]?.toLowerCase() ?? '';
  if (affiliate === 'bass' || hostLabel.includes('bass')) {
    return { src: bassLogo, alt: 'BASS' };
  }
  return null;
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setSelectedStore = useUIStore((s) => s.setSelectedStore);
  const navigate = useNavigate();
  const affiliateLogo = affiliateLogoFromLocation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.post<{ token: string; user: { storeIds?: string[] } }>('/auth/login', { username, pin });
      setAuth(result.token, result.user);
      const storeIds = result.user?.storeIds;
      if (storeIds?.length) setSelectedStore(storeIds[0]);
      else setSelectedStore('');
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
          {affiliateLogo && (
            <>
              <span className="h-10 w-px bg-gray-200" aria-hidden="true" />
              <img src={affiliateLogo.src} alt={affiliateLogo.alt} className="h-14 w-auto" />
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
