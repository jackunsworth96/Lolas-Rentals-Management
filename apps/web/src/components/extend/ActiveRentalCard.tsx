import { locationIcon } from '../public/customerContactIcons.js';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';

const MODEL_IMAGES: Record<string, string> = {
  'honda beat': hondaBeatImg,
  'honda-beat': hondaBeatImg,
  tuktuk: tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
};

function resolveImage(modelName: string): string | null {
  const lower = modelName.toLowerCase();
  for (const [key, src] of Object.entries(MODEL_IMAGES)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${dateLabel} at ${timeLabel}`;
}

interface Props {
  vehicleModelName: string;
  pickupLocationName: string;
  currentDropoffDatetime: string;
}

export function ActiveRentalCard({ vehicleModelName, pickupLocationName, currentDropoffDatetime }: Props) {
  const imgSrc = resolveImage(vehicleModelName);

  return (
    <section className="animate-card-enter overflow-hidden rounded-4xl border-4 border-gold-brand/20 bg-cream-brand shadow-[0_10px_30px_-5px_rgba(26,122,110,0.1)]">
      {/* Vehicle image — taller on mobile, more contained in the desktop sidebar */}
      <div className="flex max-h-48 items-center justify-center overflow-hidden bg-white lg:max-h-40">
        {imgSrc ? (
          <img src={imgSrc} alt={vehicleModelName} className="max-h-48 w-full object-contain lg:max-h-40" />
        ) : (
          <div className="flex h-28 w-full items-center justify-center">
            <span className="text-5xl opacity-20">🏍️</span>
          </div>
        )}
      </div>

      <div className="space-y-3 p-5 lg:space-y-4 lg:p-6">
        <div>
          <span className="rounded-full bg-gold-brand px-3 py-1 text-[10px] font-black uppercase tracking-widest text-charcoal-brand lg:px-4 lg:py-1.5 lg:text-[11px]">
            Active Rental
          </span>
          <h3 className="mt-2 font-headline text-2xl font-black text-charcoal-brand lg:mt-3 lg:text-3xl">{vehicleModelName}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-charcoal-brand/70">
            <img src={locationIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
            {pickupLocationName}
          </p>
        </div>

        <div className="border-t-2 border-sand-brand pt-4">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">Current Return</p>
            <p className="text-base font-black italic text-teal-brand lg:text-lg">{formatDateTime(currentDropoffDatetime)}</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-gold-brand" />
            <p className="text-sm font-black text-gold-brand">In Use</p>
          </div>
        </div>
      </div>
    </section>
  );
}
