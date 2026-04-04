import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';
import { DEFAULT_STORE_ID } from '@lolas/shared';
import hondaBeatImg from '../../assets/Honda Beat Image.png';
import tukTukImg from '../../assets/TukTuk Image.png';
import geckoSvg from '../../assets/Hand Drawn Assets/stand-alone-gekco--without-scenic-background--chil.svg';

interface ModelPricing {
  modelId: string;
  modelName: string;
  dailyRate: number | null;
}

const FALLBACK_FLEET: { name: string; img: string | null; desc: string }[] = [
  { name: 'Honda Beat', img: hondaBeatImg, desc: 'Perfect for zipping through palm-lined roads with ease and efficiency.' },
  { name: 'Inflatable Kayak', img: null, desc: 'Lightweight and portable. Discover hidden lagoons at your own pace.' },
];

const IMAGE_MAP: Record<string, string> = {
  'honda beat': hondaBeatImg,
  'tuktuk': tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
};

const HIDDEN_MODELS = ['tvs'];

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
    ? models
        .filter((m) => {
          const name = m.modelName.toLowerCase();
          // Hide TVS tuktuk only: require both brand marker and tuktuk in the name.
          const hide = name.includes('tuk') && HIDDEN_MODELS.some((h) => name.includes(h));
          return !hide;
        })
        .map((m) => ({
          key: m.modelId,
          name: m.modelName,
          price: m.dailyRate != null ? `${formatCurrency(m.dailyRate)}/day` : null,
          img: imageForModel(m.modelName),
          desc: FALLBACK_FLEET.find((f) => m.modelName.toLowerCase().includes(f.name.toLowerCase()))?.desc ?? (
            m.modelName.toLowerCase().includes('tuk')
              ? 'A comfortable and practical tuk-tuk, perfect for groups or those wanting a relaxed island experience.'
              : ''
          ),
        }))
    : FALLBACK_FLEET.map((f) => ({
        key: f.name,
        name: f.name,
        price: null,
        img: f.img,
        desc: f.desc,
      }));

  return (
    <section
      className="mx-auto max-w-7xl px-6 py-16"
      style={{ position: 'relative', overflow: 'hidden' }}
    >
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <p
          className="font-lato"
          style={{
            fontSize: 13,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: '#00577C',
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Our Fleet
        </p>
        <h2
          className="font-headline font-bold"
          style={{
            fontSize: 'clamp(32px, 5vw, 42px)',
            color: '#363737',
            marginBottom: 16,
            lineHeight: 1.2,
          }}
        >
          Choose Your Ride
        </h2>
        <p
          className="font-lato"
          style={{
            fontSize: 16,
            color: '#363737',
            opacity: 0.65,
            maxWidth: 480,
            margin: '0 auto',
            lineHeight: 1.6,
          }}
        >
          Well maintained, safety checked, and ready for every Siargao adventure.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 32,
          maxWidth: 720,
          margin: '0 auto',
        }}
      >
        {items.map((v, i) => (
          <div
            key={v.key}
            className="group animate-card-enter overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
            style={{
              backgroundColor: '#FAF6F0',
              borderRadius: 20,
              boxShadow: '0 2px 16px rgba(0,0,0,0.07)',
              animationDelay: `${i * 100}ms`,
            }}
          >
            <div
              className="relative overflow-hidden"
              style={{
                height: 240,
                backgroundColor: '#f1e6d6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
              }}
            >
              {/* Subtle circle blob behind vehicle */}
              <div
                style={{
                  position: 'absolute',
                  width: 200,
                  height: 200,
                  borderRadius: '50%',
                  backgroundColor: '#FCBC5A',
                  opacity: 0.25,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />

              {v.img ? (
                <img
                  src={v.img}
                  alt={v.name}
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    width: '90%',
                    height: '90%',
                    objectFit: 'contain',
                    transition: 'transform 0.5s ease',
                    filter: 'drop-shadow(0 6px 16px rgba(0,0,0,0.18))',
                  }}
                  className="group-hover:scale-105"
                />
              ) : (
                <span style={{ fontSize: 64, opacity: 0.3, zIndex: 1, position: 'relative' }}>
                  🛵
                </span>
              )}

              <div style={{
                position: 'absolute', top: 12, right: 12, zIndex: 2,
                backgroundColor: 'rgba(255,255,255,0.95)',
                borderRadius: 9999, padding: '4px 12px',
                fontSize: 13, fontWeight: 700, color: '#00577C',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                {loading ? '...' : v.price ?? 'See pricing'}
              </div>
            </div>

            <div style={{ padding: '20px 24px 24px' }}>
              <h5
                className="font-headline font-bold"
                style={{
                  fontSize: 20,
                  color: '#363737',
                  marginBottom: 6,
                }}
              >
                {v.name}
              </h5>
              <p
                className="font-lato"
                style={{
                  fontSize: 14,
                  color: '#363737',
                  opacity: 0.65,
                  marginBottom: 20,
                  lineHeight: 1.5,
                }}
              >
                {v.desc}
              </p>
              <Link to="/book/reserve">
                <button
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    backgroundColor: '#FCBC5A',
                    color: '#363737',
                    border: '2px solid #363737',
                    borderRadius: 8,
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    boxShadow: '3px 3px 0 #363737',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                    fontFamily: 'Lato, sans-serif',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translate(-2px, -2px)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '5px 5px 0 #363737';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.transform = 'translate(0, 0)';
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = '3px 3px 0 #363737';
                  }}
                >
                  Book Your Ride
                </button>
              </Link>
            </div>
          </div>
        ))}
      </div>

      <img
        src={geckoSvg}
        alt=""
        style={{
          position: 'absolute',
          right: -20,
          bottom: 40,
          width: 140,
          height: 'auto',
          opacity: 0.85,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
    </section>
  );
}
