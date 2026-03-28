import { useState } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import lolaFace from '../../assets/Lola Face Icon.svg';

type Props = {
  supabase: SupabaseClient;
  session: Session | null;
  onSignedOut: () => void;
};

export function PawCardLoginPanel({ supabase, session, onSignedOut }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const displayName =
    (session?.user.user_metadata?.full_name as string | undefined)?.trim() ||
    session?.user.email?.split('@')[0] ||
    'there';

  const handleSignOut = async () => {
    setMessage('');
    await supabase.auth.signOut();
    onSignedOut();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (error) throw error;
        setMessage('Check your email to confirm your account, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      }
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (session) {
    return (
      <div className="text-center">
        <img src={lolaFace} alt="Lola" className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-amber-200/40 bg-white p-1 object-contain" />
        <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>
          Welcome, {displayName}!
        </h3>
        <p className="text-sm mb-4" style={{ color: '#3e4946' }}>{session.user.email}</p>
        <button type="button" onClick={handleSignOut} className="text-xs font-medium underline" style={{ color: '#6e7976' }}>
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <img src={lolaFace} alt="Lola" className="w-16 h-16 mx-auto mb-3 rounded-full border-4 border-amber-200/40 bg-white p-1 object-contain" />
      <h3 className="text-2xl font-bold mb-1" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>Welcome</h3>
      <p className="text-sm mb-6" style={{ color: '#3e4946' }}>Sign in with email to access your Paw Card</p>

      <div className="flex gap-2 mb-4 justify-center">
        <button
          type="button"
          onClick={() => { setMode('signin'); setMessage(''); }}
          className="px-4 py-2 rounded-full text-xs font-bold"
          style={mode === 'signin' ? { background: '#1A7A6E', color: '#fff' } : { background: '#eae1d2', color: '#1A7A6E' }}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => { setMode('signup'); setMessage(''); }}
          className="px-4 py-2 rounded-full text-xs font-bold"
          style={mode === 'signup' ? { background: '#1A7A6E', color: '#fff' } : { background: '#eae1d2', color: '#1A7A6E' }}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-left">
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-semibold mb-1.5 ml-1">Full Name</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Juan Dela Cruz"
              className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
              style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-semibold mb-1.5 ml-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hello@siargao.com"
            className="w-full px-4 py-3 rounded-lg border-none focus:ring-2 transition-all"
            style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }}
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1.5 ml-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            minLength={6}
            className="w-full px-4 py-3 rounded-lg border-none focus:ring-2"
            style={{ background: '#f0e7d8', outlineColor: '#1A7A6E' }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-full font-bold text-white transition-transform hover:scale-[1.02] disabled:opacity-50"
          style={{ background: '#1A7A6E' }}
        >
          {loading ? 'Please wait...' : mode === 'signup' ? 'Create My Paw Card' : 'Sign in'}
        </button>
        {message && (
          <p className="text-sm text-center" style={{ color: message.includes('Check your email') ? '#1A7A6E' : '#b91c1c' }}>
            {message}
          </p>
        )}
      </form>
    </div>
  );
}
