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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
      <div className="aspect-video overflow-hidden bg-sand-brand">
        {imgSrc ? (
          <img src={imgSrc} alt={vehicleModelName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="text-5xl opacity-20">🏍️</span>
          </div>
        )}
      </div>

      <div className="space-y-4 p-6">
        <div>
          <span className="rounded-full bg-gold-brand px-4 py-1.5 text-[11px] font-black uppercase tracking-widest text-charcoal-brand">
            Active Rental
          </span>
          <h3 className="mt-3 font-headline text-3xl font-black text-charcoal-brand">{vehicleModelName}</h3>
          <p className="mt-1 flex items-center gap-1.5 font-semibold text-charcoal-brand/70">
            <img src={locationIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
            {pickupLocationName}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t-2 border-sand-brand pt-6">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">Current Return</p>
            <p className="text-xl font-black italic text-teal-brand">{formatDate(currentDropoffDatetime)}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-brand/60">Status</p>
            <p className="text-xl font-black text-gold-brand">In Use</p>
          </div>
        </div>
      </div>
    </section>
  );
}
