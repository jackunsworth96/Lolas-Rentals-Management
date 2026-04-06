import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '../../utils/currency.js';
import { api } from '../../api/client.js';
import discountCard from '../../assets/Discount Card.svg';
import pawPrint from '../../assets/Paw Print.svg';
import lolaFace from '../../assets/Lola Face Icon.svg';
import handOnHeart from '../../assets/Hand on Heart.svg';
import {
  sumAmountSaved,
  rowsForUser,
  aggregateLeaderboard,
  type LeaderboardPeriod,
} from './paw-card-queries.js';
import { normalizeEmail } from './paw-card-utils.js';
import type { SavingsRow } from './paw-card-utils.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import BorderGlow from '../../components/home/BorderGlow.js';
import CountUp from '../../components/home/CountUp.js';

const HISTORICAL_DONATIONS = 280000;

type Props = {
  accessEmail: string;
  displayFullName: string;
};

export function PawCardDashboard({ accessEmail, displayFullName }: Props) {
  const email = accessEmail;
  const userKey = normalizeEmail(email);

  const [leaderboardPeriod, setLeaderboardPeriod] = useState<LeaderboardPeriod>('month');

  const dashQuery = useQuery({
    queryKey: ['paw-card', 'dashboard', 'all-rows', userKey],
    queryFn: () => {
      const q = new URLSearchParams({ email, period: 'all' });
      return api.get<SavingsRow[]>(`/public/paw-card/entries?${q}`);
    },
    enabled: !!email,
  });

  const lbQuery = useQuery({
    queryKey: ['paw-card', 'leaderboard', leaderboardPeriod, userKey],
    queryFn: () => {
      const q = new URLSearchParams({ email, period: leaderboardPeriod });
      return api.get<SavingsRow[]>(`/public/paw-card/entries?${q}`);
    },
    enabled: !!email,
  });

  const allRows = dashQuery.data ?? [];
  const myRows = useMemo(() => rowsForUser(allRows, email), [allRows, email]);
  const myTotal = useMemo(() => sumAmountSaved(myRows), [myRows]);
  const communityTotal = useMemo(
    () => sumAmountSaved(allRows) + HISTORICAL_DONATIONS,
    [allRows],
  );
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
  const dashErr =
    dashQuery.error instanceof Error
      ? dashQuery.error.message
      : dashQuery.error
        ? 'Could not load your stats.'
        : '';
  const lbErr =
    lbQuery.error instanceof Error
      ? lbQuery.error.message
      : lbQuery.error
        ? 'Could not load leaderboard.'
        : '';

  return (
    <section className="px-6 py-12 font-lato" style={{ background: '#f1e6d6' }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="font-headline text-4xl font-bold" style={{ color: '#1f1b12' }}>Your Impact</h2>
            <p style={{ color: '#3e4946' }}>Real-time stats of your contributions</p>
          </div>
        </div>

        {dashErr && <p className="text-sm text-red-600 mb-4">{dashErr}</p>}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <BorderGlow
            backgroundColor="#ffffff"
            borderRadius={16}
            glowIntensity={0.8}
            className={`shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${!dashLoading ? 'animate-card-enter' : ''}`}
            style={!dashLoading ? { animationDelay: '0ms' } : undefined}
          >
            <div className="flex h-full flex-col justify-between p-8">
              <div>
                <img src={discountCard} alt="" className="w-8 h-8 mb-2 bg-transparent" />
                <h4 className="font-headline text-xs font-bold uppercase tracking-wider" style={{ color: '#3e4946' }}>My Total Savings</h4>
              </div>
              <p className="font-headline text-4xl font-black mt-2" style={{ color: '#1A7A6E' }}>
                {dashLoading
                  ? '…'
                  : <>₱<CountUp to={myTotal} from={0} separator="," startWhen={!dashLoading} /></>}
              </p>
              <p className="mt-3 text-sm" style={{ color: '#3e4946' }}>
                {dashLoading ? 'Loading visits…' : `${myRows.length} visit${myRows.length !== 1 ? 's' : ''} logged`}
              </p>
            </div>
          </BorderGlow>

          <BorderGlow
            backgroundColor="#1A7A6E"
            borderRadius={16}
            glowIntensity={0.7}
            className={`shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${!dashLoading ? 'animate-card-enter' : ''}`}
            style={!dashLoading ? { animationDelay: '100ms' } : undefined}
          >
            <div className="relative flex h-full flex-col justify-between p-8" style={{ color: '#ffffff' }}>
              <div className="relative z-10">
                <img src={pawPrint} alt="" className="w-8 h-8 mb-2 brightness-0 invert bg-transparent" />
                <h4 className="font-headline text-xs font-bold uppercase tracking-wider" style={{ color: '#ffffff', opacity: 0.8 }}>Lola&apos;s Matched Donation</h4>
              </div>
              <div className="relative z-10">
                <p className="font-headline text-4xl font-black mt-2 mb-1" style={{ color: '#ffffff' }}>
                  {dashLoading
                    ? '…'
                    : <>₱<CountUp to={Math.round(myTotal)} from={0} separator="," startWhen={!dashLoading} /></>}
                </p>
                <p className="text-xs" style={{ color: '#ffffff', opacity: 0.7 }}>
                  Every peso you save, Lola&apos;s donates the same to Be Pawsitive NGO.
                </p>
              </div>
              <img src={lolaFace} alt="" className="absolute -bottom-4 -right-4 w-28 h-28 opacity-15 pointer-events-none z-0 bg-transparent" />
            </div>
          </BorderGlow>

          <BorderGlow
            backgroundColor="#F5B731"
            borderRadius={16}
            glowIntensity={0.5}
            className={`shadow-lg transition-all duration-200 hover:-translate-y-0.5 md:row-span-2 ${!dashLoading ? 'animate-card-enter' : ''}`}
            style={{ color: '#271900', ...(!dashLoading ? { animationDelay: '200ms' } : {}) }}
          >
            <div className="flex h-full flex-col p-8">
              <div className="mb-auto">
                <img src={handOnHeart} alt="" className="w-8 h-8 mb-2 bg-transparent" />
                <h4 className="font-headline text-xs font-bold uppercase tracking-wider">Community Total</h4>
                <p className="font-headline text-4xl font-black mt-2">
                  {dashLoading
                    ? '…'
                    : <>₱<CountUp to={Math.round(communityTotal)} from={0} separator="," startWhen={!dashLoading} /></>}
                </p>
              </div>
              <div className="mt-8 pt-6 border-t" style={{ borderColor: 'rgba(39,25,0,0.1)' }}>
                <p className="text-lg font-medium leading-snug">
                  Donated to Be Pawsitive since 2022 — and counting 🐾
                </p>
              </div>
            </div>
          </BorderGlow>

          <BorderGlow
            backgroundColor="#ffffff"
            borderRadius={16}
            glowIntensity={0.8}
            className="shadow-lg md:col-span-3"
          >
            <div className="p-8">
              <h4 className="font-headline font-bold text-sm mb-3" style={{ color: '#3e4946' }}>Recent activity</h4>
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
          </BorderGlow>

          <FadeUpSection className="md:col-span-3">
          <BorderGlow backgroundColor="#ffffff" borderRadius={16} glowIntensity={0.8} className="shadow-lg">
          <div className="p-8">
            <div className="mb-4 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <h4 className="font-headline text-2xl font-bold">Top Savers</h4>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('month')}
                  className="rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ease-in-out"
                  style={
                    leaderboardPeriod === 'month'
                      ? { background: '#1A7A6E', color: '#fff' }
                      : { background: '#eae1d2', color: '#1A7A6E' }
                  }
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={() => setLeaderboardPeriod('all')}
                  className="rounded-full px-4 py-2 text-xs font-bold transition-all duration-300 ease-in-out"
                  style={
                    leaderboardPeriod === 'all'
                      ? { background: '#1A7A6E', color: '#fff' }
                      : { background: '#eae1d2', color: '#1A7A6E' }
                  }
                >
                  All Time
                </button>
              </div>
            </div>

            {lbErr && <p className="text-sm text-red-600 mb-3">{lbErr}</p>}

            {myRank > 10 && myEntry && (
              <div
                className="mb-4 flex items-center justify-between rounded-lg border-l-4 p-3 transition-colors duration-150 hover:bg-sand-brand/50"
                style={{ background: 'rgba(26,122,110,0.05)', borderColor: '#1A7A6E' }}
              >
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
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors duration-150 hover:bg-sand-brand/50"
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
          </BorderGlow>
          </FadeUpSection>
        </div>
      </div>
    </section>
  );
}
