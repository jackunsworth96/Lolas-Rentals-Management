import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { PrimaryCtaButton } from '../public/PrimaryCtaButton.js';
import { formatCurrency } from '../../utils/currency.js';
import { DEFAULT_STORE_ID } from '@lolas/shared';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';

interface ModelPricing {
  modelId: string;
  modelName: string;
  dailyRate: number | null;
}

const FALLBACK_FLEET: { name: string; img: string | null; desc: string }[] = [
  { name: 'Honda Beat', img: hondaBeatImg, desc: 'Perfect for zipping through palm-lined roads with ease and efficiency.' },
  { name: 'TVS Tuk-Tuk', img: tukTukImg, desc: 'The ultimate group explorer. Rugged, iconic, and spacious enough for boards.' },
  { name: 'Inflatable Kayak', img: null, desc: 'Lightweight and portable. Discover hidden lagoons at your own pace.' },
];

const IMAGE_MAP: Record<string, string> = {
  'honda beat': hondaBeatImg,
  tuktuk: tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
  'tvs tuk-tuk': tukTukImg,
};

function imageForModel(name: string): string | null {
  const lower = name.toLowerCase();
  for (const [key, src] of Object.entries(IMAGE_MAP)) {
    if (lower.includes(key)) return src;
  }
  return null;
}

function buildOneDayRange(): { pickup: string; dropoff: string } {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  now.setHours(9, 0, 0, 0);
  const pickup = now.toISOString();
  const drop = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return { pickup, dropoff: drop.toISOString() };
}

export function FleetPreviewSection() {
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { pickup, dropoff } = buildOneDayRange();
        const storeId = DEFAULT_STORE_ID;

        const avail = await api.get<Array<{ modelId: string; modelName: string; availableCount: number }>>(
          `/public/booking/availability?storeId=${storeId}&pickupDatetime=${encodeURIComponent(pickup)}&dropoffDatetime=${encodeURIComponent(dropoff)}`,
        );
        if (cancelled) return;

        const locs = await api.get<Array<{ id: number }>>(`/public/booking/locations?storeId=${storeId}`);
        if (cancelled || !locs.length) return;
        const locId = locs[0].id;

        const priced: ModelPricing[] = await Promise.all(
          avail.map(async (m) => {
            try {
              const q = await api.get<{ dailyRate: number }>(
                `/public/booking/quote?storeId=${storeId}&vehicleModelId=${m.modelId}&pickupDatetime=${encodeURIComponent(pickup)}&dropoffDatetime=${encodeURIComponent(dropoff)}&pickupLocationId=${locId}&dropoffLocationId=${locId}`,
              );
              return { modelId: m.modelId, modelName: m.modelName, dailyRate: q.dailyRate };
            } catch {
              return { modelId: m.modelId, modelName: m.modelName, dailyRate: null };
            }
          }),
        );
        if (!cancelled) setModels(priced);
      } catch {
        // keep fallback
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const items = models.length > 0
    ? models.map((m) => ({
        key: m.modelId,
        name: m.modelName,
        price: m.dailyRate != null ? `${formatCurrency(m.dailyRate)}/day` : null,
        img: imageForModel(m.modelName),
        desc: FALLBACK_FLEET.find((f) => m.modelName.toLowerCase().includes(f.name.toLowerCase()))?.desc ?? '',
      }))
    : FALLBACK_FLEET.map((f) => ({
        key: f.name,
        name: f.name,
        price: null,
        img: f.img,
        desc: f.desc,
      }));

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="mb-12 flex flex-col items-end justify-between gap-6 md:flex-row">
        <div>
          <h3 className="font-headline text-4xl font-black leading-tight text-charcoal-brand">
            Featured <br />
            <span className="italic text-teal-brand">Island Essentials</span>
          </h3>
        </div>
        <p className="max-w-md text-charcoal-brand/70">
          Our fleet is meticulously maintained and supports local community growth through every kilometer.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {items.map((v, i) => (
          <div
            key={v.key}
            className="group animate-card-enter overflow-hidden rounded-4xl bg-cream-brand shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="relative h-64 overflow-hidden bg-sand-brand">
              {v.img ? (
                <img src={v.img} alt={v.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <span className="text-5xl opacity-20">🛶</span>
                </div>
              )}
              <div className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1 text-sm font-bold text-teal-brand backdrop-blur">
                {loading ? '...' : v.price ?? 'See pricing'}
              </div>
            </div>
            <div className="p-6">
              <h5 className="mb-2 text-xl font-bold text-charcoal-brand">{v.name}</h5>
              <p className="mb-6 text-sm text-charcoal-brand/70">{v.desc}</p>
              <Link to="/book/reserve">
                <PrimaryCtaButton className="flex w-full items-center justify-center gap-2 py-3">
                  Book 📅
                </PrimaryCtaButton>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
