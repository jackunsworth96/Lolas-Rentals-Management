import { useNavigate } from 'react-router-dom';
import { staffCounterApi } from '../../api/counter.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { CounterKiosk } from './CounterKiosk.js';

/** Our own reception tablet: walk-ins book from now and pick up at the store. */
export default function CounterPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  return (
    <CounterKiosk
      counter={staffCounterApi}
      mode="now"
      homePath="/counter"
      onLogoHold={() => {
        if (window.confirm('Sign this tablet out of the counter?')) {
          logout();
          navigate('/login', { replace: true });
        }
      }}
    />
  );
}
