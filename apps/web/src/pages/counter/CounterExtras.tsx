import { useState } from 'react';
import { Check } from 'lucide-react';
import peaceOfMindIcon from '../../assets/Basket/Peace of Mind.svg';
import surfRackIcon from '../../assets/Basket/Surf Rack Icon.svg';
import bungeeCordIcon from '../../assets/Basket/Bungee Cord Icon.svg';
import deliveryCollectionIcon from '../../assets/Home/Delivery Collection Icon.svg';
import cancellationCoverIcon from '../../assets/Home/Cancellation Cover.svg';
import type { CounterAddon, CounterExtras as Extras } from '../../api/counter.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { PeaceOfMindModal } from '../../components/basket/PeaceOfMindModal.js';
import { CANCELLATION_COVER_IDEAL_FOR } from '../../components/basket/AddOnsSection.js';
import { formatPhpNumber } from '../../utils/currency.js';

const ICONS: Record<CounterAddon['kind'], string> = {
  peace_of_mind: peaceOfMindIcon,
  cancellation_cover: cancellationCoverIcon,
  surf_rack: surfRackIcon,
  bungee: bungeeCordIcon,
};

const LABELS: Record<CounterAddon['kind'], { title: string; blurb: string }> = {
  peace_of_mind: { title: 'Peace of Mind Cover', blurb: 'Ride without worrying about the small stuff.' },
  cancellation_cover: {
    title: 'Cancellation Cover',
    blurb: "Cancel any time during your rental and get refunded for the days you don't use.",
  },
  surf_rack: { title: 'Surf Rack', blurb: 'Carry your board safely.' },
  bungee: { title: 'Bungee Cord', blurb: 'Strap down bags and shopping.' },
};

function Peso({ amount }: { amount: number }) {
  return <><PesoSign />{formatPhpNumber(amount)}</>;
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        on ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/25 bg-white text-transparent'
      }`}
    >
      <Check className="h-5 w-5" strokeWidth={3} />
    </span>
  );
}

function PeaceOfMindCard({ addon, days, selected, onToggle }: { addon: CounterAddon; days: number; selected: boolean; onToggle: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  return (
    <>
    <div
      onClick={onToggle}
      className={`relative w-full cursor-pointer overflow-hidden rounded-3xl border-[3px] bg-white p-6 text-left shadow-[5px_5px_0_#363737] transition active:translate-x-0.5 active:translate-y-0.5 ${
        selected ? 'border-teal-brand' : 'border-charcoal-brand'
      }`}
    >
      <span className="absolute right-0 top-0 rounded-bl-2xl border-b-2 border-l-2 border-charcoal-brand bg-gold-brand px-4 py-1.5 font-lato text-sm font-black uppercase tracking-wide text-charcoal-brand">
        ★ Customer favourite
      </span>
      <div className="flex items-start gap-5 pr-4">
        <img src={ICONS.peace_of_mind} alt="" className="mt-1 h-16 w-16 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-3xl font-bold text-teal-brand">{LABELS.peace_of_mind.title}</h3>
          <p className="mt-1 font-lato text-base text-charcoal-brand/70">{LABELS.peace_of_mind.blurb}</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailsOpen(true);
            }}
            className="mt-2 font-lato text-base font-bold text-teal-brand underline underline-offset-4"
          >
            See what&apos;s covered
          </button>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-[#FAF6F0] px-5 py-4">
        <div className="font-lato text-charcoal-brand">
          <span className="text-2xl font-black"><Peso amount={addon.unitPrice} /></span>
          <span className="ml-1 text-base font-semibold text-charcoal-brand/60">{addon.addonType === 'per_day' ? 'per day' : 'once'}</span>
          {addon.addonType === 'per_day' && days > 1 && (
            <span className="ml-2 text-sm text-charcoal-brand/60">(<Peso amount={addon.total} /> for {days} days)</span>
          )}
        </div>
        <button
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex items-center gap-3 rounded-full px-5 py-2.5 font-lato text-base font-black uppercase ${
            selected ? 'bg-teal-brand text-white' : 'bg-gold-brand text-charcoal-brand'
          }`}
        >
          {selected ? <><Check className="h-5 w-5" strokeWidth={3} /> Added</> : 'Add Peace of Mind'}
        </button>
      </div>
    </div>
    <PeaceOfMindModal open={detailsOpen} onClose={() => setDetailsOpen(false)} showFullDetailsLink={false} />
    </>
  );
}

function CancellationCoverCard({ addon, selected, onToggle }: { addon: CounterAddon; selected: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      className={`relative w-full cursor-pointer overflow-hidden rounded-3xl border-[3px] bg-white p-6 text-left transition ${
        selected ? 'border-teal-brand' : 'border-charcoal-brand/15'
      }`}
    >
      <span className="absolute right-0 top-0 rounded-bl-2xl bg-teal-brand/10 px-4 py-1.5 font-lato text-sm font-black uppercase tracking-wide text-teal-brand">
        Useful to have
      </span>
      <div className="flex items-start gap-5 pr-4">
        <img src={ICONS.cancellation_cover} alt="" className="mt-1 h-14 w-14 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h3 className="font-headline text-2xl font-bold text-teal-brand">{LABELS.cancellation_cover.title}</h3>
          <p className="mt-1 font-lato text-base text-charcoal-brand/70">{LABELS.cancellation_cover.blurb}</p>
          <ul className="mt-2 space-y-1 font-lato text-sm text-charcoal-brand/60">
            {CANCELLATION_COVER_IDEAL_FOR.map((line) => (
              <li key={line} className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-brand" strokeWidth={3} />
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl bg-[#FAF6F0] px-5 py-4">
        <div className="font-lato text-charcoal-brand">
          <span className="text-2xl font-black"><Peso amount={addon.total} /></span>
          <span className="ml-1 text-base font-semibold text-charcoal-brand/60">for your rental</span>
        </div>
        <button
          type="button"
          aria-pressed={selected}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={`flex items-center gap-3 rounded-full px-5 py-2.5 font-lato text-base font-black uppercase ${
            selected ? 'bg-teal-brand text-white' : 'border-2 border-teal-brand bg-white text-teal-brand'
          }`}
        >
          {selected ? <><Check className="h-5 w-5" strokeWidth={3} /> Added</> : 'Add Cover'}
        </button>
      </div>
    </div>
  );
}

function SmallAddonCard({ addon, selected, onToggle }: { addon: CounterAddon; selected: boolean; onToggle: () => void }) {
  const label = LABELS[addon.kind];
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={addon.soldOut && !selected}
      aria-pressed={selected}
      className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        selected ? 'border-teal-brand' : 'border-charcoal-brand/10'
      }`}
    >
      <img src={ICONS[addon.kind]} alt="" className="h-11 w-11 shrink-0 object-contain" />
      <div className="min-w-0 flex-1">
        <div className="font-lato text-lg font-bold text-charcoal-brand">{label.title}</div>
        <div className="font-lato text-sm text-charcoal-brand/60">
          {addon.soldOut ? 'Fully booked for these dates' : label.blurb}
        </div>
      </div>
      <div className="shrink-0 text-right font-lato font-bold text-charcoal-brand">
        <Peso amount={addon.unitPrice} />
        <div className="text-xs font-semibold text-charcoal-brand/50">{addon.addonType === 'per_day' ? 'per day' : 'once'}</div>
      </div>
      <Toggle on={selected} />
    </button>
  );
}

export interface CounterExtrasProps {
  extras: Extras | undefined;
  loading: boolean;
  days: number;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  collectionId: number | null;
  onCollection: (id: number | null) => void;
  stayingAt: string;
  onStayingAt: (v: string) => void;
  inputClass: string;
}

export function CounterExtras(props: CounterExtrasProps) {
  const { extras, loading, days, selectedIds, onToggle, collectionId, onCollection } = props;
  if (loading) {
    return (
      <div className="mt-16 flex justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
      </div>
    );
  }
  const addons = extras?.addons ?? [];
  const pom = addons.find((a) => a.kind === 'peace_of_mind');
  const cancellation = addons.find((a) => a.kind === 'cancellation_cover');
  const others = addons.filter((a) => a.kind !== 'peace_of_mind' && a.kind !== 'cancellation_cover');
  const areas = extras?.collectionAreas ?? [];
  const collecting = collectionId !== null;

  return (
    <div className="space-y-6">
      {pom && <PeaceOfMindCard addon={pom} days={days} selected={selectedIds.has(pom.id)} onToggle={() => onToggle(pom.id)} />}
      {cancellation && (
        <CancellationCoverCard addon={cancellation} selected={selectedIds.has(cancellation.id)} onToggle={() => onToggle(cancellation.id)} />
      )}

      {(others.length > 0 || areas.length > 0) && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {others.map((a) => (
            <SmallAddonCard key={a.id} addon={a} selected={selectedIds.has(a.id)} onToggle={() => onToggle(a.id)} />
          ))}
          {areas.length > 0 && (
            <button
              type="button"
              aria-pressed={collecting}
              onClick={() => onCollection(collecting ? null : areas[0]!.id)}
              className={`flex items-center gap-4 rounded-2xl border-2 bg-white p-4 text-left transition sm:col-span-2 ${
                collecting ? 'border-teal-brand' : 'border-charcoal-brand/10'
              }`}
            >
              <img src={deliveryCollectionIcon} alt="" className="h-11 w-11 shrink-0 object-contain" />
              <div className="min-w-0 flex-1">
                <div className="font-lato text-lg font-bold text-charcoal-brand">We&apos;ll collect it from you</div>
                <div className="font-lato text-sm text-charcoal-brand/60">Skip the trip back: we pick the vehicle up where you&apos;re staying.</div>
              </div>
              <div className="shrink-0 text-right font-lato text-sm font-semibold text-charcoal-brand/60">
                from <span className="text-base font-bold text-charcoal-brand"><Peso amount={areas[0]!.fee} /></span>
              </div>
              <Toggle on={collecting} />
            </button>
          )}
        </div>
      )}

      {collecting && (
        <div className="rounded-2xl bg-white p-5">
          <p className="font-lato text-base font-bold text-charcoal-brand">Which area are you staying in?</p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            {areas.map((area) => (
              <button
                key={area.id}
                type="button"
                onClick={() => onCollection(area.id)}
                className={`rounded-full border-2 px-4 py-2 font-lato text-base font-bold ${
                  area.id === collectionId ? 'border-teal-brand bg-teal-brand text-white' : 'border-charcoal-brand/15 bg-white text-charcoal-brand'
                }`}
              >
                {area.name} · <Peso amount={area.fee} />
              </button>
            ))}
          </div>
          <label className="mt-4 block">
            <span className="mb-1.5 block font-lato text-base font-bold text-charcoal-brand">Where are you staying? (optional)</span>
            <input
              className={props.inputClass}
              value={props.stayingAt}
              onChange={(e) => props.onStayingAt(e.target.value)}
              placeholder="Hotel or villa name"
              autoComplete="off"
            />
          </label>
        </div>
      )}
    </div>
  );
}
