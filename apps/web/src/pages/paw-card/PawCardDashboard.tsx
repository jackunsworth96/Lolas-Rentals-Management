import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { formatCurrency } from '../../utils/currency.js';
import discountCard from '../../assets/Discount Card.svg';
import pawPrint from '../../assets/Paw Print.svg';
import lolaFace from '../../assets/Lola Face Icon.svg';
import handOnHeart from '../../assets/Hand on Heart.svg';
import {
  fetchSavingsRows,
  sumAmountSaved,
  rowsForUser,
  aggregateLeaderboard,
  type LeaderboardPeriod,
} from './paw-card-queries.js';
import { normalizeEmail } from './paw-card-utils.js';
import type { SavingsRow } from './paw-card-utils.js';

type Props = {
  supabase: SupabaseClient;
  session: Session;
  displayFullName: string;
};

export function PawCardDashboard({ supabase, session, displayFullName }: Props) {
  const email = session.user.email ?? '';
  const userKey = normalizeEmail(email);

  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>('month');

  const dashQuery = useQuery({
    queryKey: ['paw-card', 'dashboard', 'all-rows', userKey],
    queryFn: () => fetchSavingsRows(supabase, 'all'),
    enabled: !!email,
  });

  const lbQuery = useQuery({
    queryKey: ['paw-card', 'leaderboard', leaderboardPeriod],
    queryFn: () => fetchSavingsRows(supabase, leaderboardPeriod),
    enabled: !!email,
  });

  const allRows = dashQuery.data ?? [];
  const myRows = useMemo(() => rowsForUser(allRows, email), [allRows, email]);
  const myTotal = useMemo(() => sumAmountSaved(myRows), [myRows]);
  const communityTotal = useMemo(() => sumAmountSaved(allRows), [allRows]);
  const uniqueCustomers = useMemo(() => {
    const s = new Set<string>();
    for (const r of allRows) {
      const k = normalizeEmail(r.email ?? '') || normalizeEmail(r.full_name ?? '');
      if (k) s.add(k);
    }
    return s.size;
  }, [allRows]);
  const recent = useMemo(() => {
    const mine = [...myRows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return mine.slice(0, 5);
  }, [myRows]);

  const lbRows = lbQuery.data ?? [];
  const ranked = useMemo(() => aggregateLeaderboard(lbRows), [lbRows]);
  const myRank = ranked.findIndex((e) => e.key === userKey) + 1;
  const myEntry = ranked.find((e) => e.key === userKey);
  const top = ranked.slice(0, 10);

  const dashLoading = dashQuery.isLoading;
  const dashErr = dashQuery.error instanceof Error ? dashQuery.message : dashQuery.error ? 'Could not load your stats.' : '';
  const lbErr = lbQuery.error instanceof Error ? lbQuery.message : lbQuery.error ? 'Could not load leaderboard.' : '';

  return (
    <section className="px-6 py-12" style={{ background: 'rgba(246,237,221,0.4)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-4xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1f1b12' }}>Your Impact</h2>
            <p style={{ color: '#3e4946' }}>Real-time stats of your contributions</p>
          </div>
        </div>

        {dashErr && <p className="text-sm text-red-600 mb-4">{dashErr}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col justify-between">
            <div>
              <img src={discountCard} alt="" className="w-8 h-8 mb-2" />
              <h4 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#3e4946' }}>My Total Savings</h4>
            </div>
            <p className="text-4xl font-black mt-2" style={{ fontFamily: 'Epilogue, sans-serif', color: '#1A7A6E' }}>
              {dashLoading ? '…' : formatCurrency(myTotal)}
            </p>
            <p className="mt-3 text-sm" style={{ color: '#3e4946' }}>
              {dashLoading ? 'Loading visits…' : `${myRows.length} visit${myRows.length !== 1 ? 's' : ''} logged`}
            </p>
          </div>

          <div className="p-8 rounded-2xl shadow-lg flex flex-col justify-between text-white relative overflow-hidden" style={{ background: '#1A7A6E' }}>
            <div className="relative z-10">
              <img src={pawPrint} alt="" className="w-8 h-8 mb-2 brightness-0 invert" />
              <h4 className="text-xs font-bold uppercase tracking-wider opacity-80">Lola&apos;s Matched Donation</h4>
            </div>
            <div className="relative z-10">
              <p className="text-4xl font-black mt-2 mb-1" style={{ fontFamily: 'Epilogue, sans-serif' }}>
                {dashLoading ? '…' : formatCurrency(myTotal)}
              </p>
              <p className="text-xs opacity-70">
                Every peso you save, Lola&apos;s donates the same to Be Pawsitive NGO.
              </p>
            </div>
            <img src={lolaFace} alt="" className="absolute -bottom-4 -right-4 w-28 h-28 opacity-15 pointer-events-none z-0" />
          </div>

          <div className="p-8 rounded-2xl shadow-lg md:row-span-2 flex flex-col" style={{ background: '#F5B731', color: '#271900' }}>
            <div className="mb-auto">
              <img src={handOnHeart} alt="" className="w-8 h-8 mb-2" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Community Total</h4>
              <p className="text-4xl font-black mt-2" style={{ fontFamily: 'Epilogue, sans-serif' }}>
                {dashLoading ? '…' : formatCurrency(communityTotal)}
              </p>
            </div>
            <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(39,25,0,0.1)' }}>
              <p className="text-lg font-medium leading-snug">
                <span className="font-black text-2xl">{dashLoading ? '…' : uniqueCustomers}</span> customers contributing across{' '}
                <span className="font-black text-2xl">{dashLoading ? '…' : allRows.length}</span> visits
              </p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-lg md:col-span-3">
            <h4 className="font-bold text-sm mb-3" style={{ color: '#3e4946' }}>Recent activity</h4>
            {dashLoading ? (
              <p className="text-sm" style={{ color: '#6e7976' }}>Loading…</p>
            ) : recent.length === 0 ? (
              <p className="text-sm" style={{ color: '#6e7976' }}>No savings logged yet.</p>
            ) : (
              <ul className="space-y-2">
                {recent.map((s: SavingsRow) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm"
                    style={{ background: 'rgba(246,237,221,0.5)' }}
                  >
                    <div>
                      <span className="font-medium">{s.establishment}</span>
                      <span className="ml-2 text-xs" style={{ color: '#6e7976' }}>{s.date_of_visit ?? '—'}</span>
                    </div>
                    <span className="font-bold" style={{ color: '#1A7A6E' }}>{formatCurrency(Number(s.amount_saved))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-lg md:col-span-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <h4 className="text-2xl font-bold" style={{ fontFamily: 'Epilogue, sans-serif' }}>Top Savers</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('month')}
                  className="px-4 py-2 rounded-full text-xs font-bold"
                  style={leaderboardPeriod === 'month' ? { background: '#1A7A6E', color: '#fff' } : { background: '#eae1d2', color: '#1A7A6E' }}
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('all')}
                  className="px-4 py-2 rounded-full text-xs font-bold"
                  style={leaderboardPeriod === 'all' ? { background: '#1A7A6E', color: '#fff' } : { background: '#eae1d2', color: '#1A7A6E' }}
                >
                  All Time
                </button>
              </div>
            </div>

            {lbErr && <p className="text-sm text-red-600 mb-3">{lbErr}</p>}

            {myRank > 10 && myEntry && (
              <div className="flex items-center justify-between p-3 rounded-lg mb-4 border-l-4" style={{ background: 'rgba(26,122,110,0.05)', borderColor: '#1A7A6E' }}>
                <div className="flex items-center gap-4">
                  <span className="font-bold w-5 text-right" style={{ color: '#1A7A6E' }}>{myRank}</span>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: '#1A7A6E' }}>
                    {displayFullName[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-bold text-sm">You ({myEntry.displayName})</span>
                </div>
                <span className="font-bold text-sm">{formatCurrency(myEntry.totalSaved)}</span>
              </div>
            )}

            <div className="space-y-2">
              {lbQuery.isLoading ? (
                <p className="text-center text-sm py-6" style={{ color: '#6e7976' }}>Loading leaderboard…</p>
              ) : top.length === 0 ? (
                <p className="text-center text-sm py-6" style={{ color: '#6e7976' }}>No entries in this period yet.</p>
              ) : (
                top.map((entry, i) => {
                  const rank = i + 1;
                  const isMe = entry.key === userKey;
                  return (
                    <div
                      key={entry.key}
                      className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors"
                      style={isMe ? { background: 'rgba(26,122,110,0.05)', borderLeft: '4px solid #1A7A6E' } : {}}
                    >
                      <div className="flex items-center gap-4">
                        <span className="font-bold w-5 text-right text-sm" style={{ color: isMe ? '#1A7A6E' : '#3e4946' }}>{rank}</span>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={isMe
                            ? { background: 'rgba(26,122,110,0.2)', color: '#1A7A6E' }
                            : rank <= 3
                              ? { background: '#F5B731', color: '#271900' }
                              : { background: '#eae1d2', color: '#3e4946' }}
                        >
                          {entry.displayName[0]}
                        </div>
                        <span className={`text-sm ${isMe ? 'font-bold' : ''}`}>
                          {isMe ? `You (${entry.displayName})` : entry.displayName}
                        </span>
                      </div>
                      <span className="font-medium text-sm" style={{ color: isMe ? '#1A7A6E' : '#3e4946' }}>
                        {formatCurrency(entry.totalSaved)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {myRank > 0 && myRank <= 10 && (
              <p className="text-center text-xs mt-4 font-medium" style={{ color: '#1A7A6E' }}>
                You&apos;re ranked #{myRank} — keep going!
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
