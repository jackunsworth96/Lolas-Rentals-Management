import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { usePartnerMe } from '../../api/partner-portal.js';
import { usePartnerAuthStore } from '../../stores/partner-auth-store.js';

export default function PartnerShell() {
  const { data } = usePartnerMe();
  const logout = usePartnerAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const partner = data?.partner;

  function handleLogout() {
    logout();
    navigate('/partner/login', { replace: true });
  }

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-teal-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/partner/dashboard" className="flex items-center gap-3">
            {partner?.logo_url && <img src={partner.logo_url} alt={partner.name} className="max-h-10 max-w-32 object-contain" />}
            <div>
              <p className="text-sm font-bold text-gray-900">{partner?.name ?? 'Partner Portal'}</p>
              <p className="text-xs text-gray-500">Lola's Rentals partner dashboard</p>
            </div>
          </Link>
          <button onClick={handleLogout} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Logout</button>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 px-4 pb-3">
          <NavLink to="/partner/dashboard" className={linkCls}>Dashboard</NavLink>
          <NavLink to="/partner/book" className={linkCls}>Book Guest</NavLink>
          <NavLink to="/partner/reports" className={linkCls}>Reports</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
