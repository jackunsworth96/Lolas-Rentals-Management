import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useIsTouchDevice } from '../../hooks/useIsTouchDevice.js';
import { api } from '../../api/client.js';
import { formatCurrency } from '../../utils/currency.js';
import { DEFAULT_STORE_ID } from '@lolas/shared';
import hondaBeatImg from '../../assets/Honda Beat Image.svg';
import tukTukImg from '../../assets/TukTuk Image.svg';
import geckoSvg from '../../assets/Hand Drawn Assets/stand-alone-gekco--without-scenic-background--chil.svg';
import BorderGlow from './BorderGlow.js';

interface ModelPricing {
  modelId: string;
  modelName: string;
  dailyRate: number | null;
  minDailyRate?: number | null;
}

const FALLBACK_FLEET: {
  name: string;
  subtitle: string;
  img: string | null;
  desc: string;
  fallbackPrice: number;
}[] = [
  {
    name: 'Scooter',
    subtitle: 'Honda Beat 110cc',
    img: hondaBeatImg,
    desc: "A reliable scooter for up to 2 persons with or without a surf rack. Perfect for cruising around town and visiting the island's best destinations.",
    fallbackPrice: 465,
  },
  {
    name: 'TukTuk',
    subtitle: 'Bajaj RE 250cc',
    img: tukTukImg,
    desc: 'A great way to travel as a group, suitable for 3–4 persons. Exploring Siargao in a TukTuk is one for the bucket list — book now!',
    fallbackPrice: 1595,
  },
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

const springCfg = { damping: 30, stiffness: 100, mass: 2 };

function TiltableCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isTouch = useIsTouchDevice();
  const rotateX = useSpring(useMotionValue(0), springCfg);
  const rotateY = useSpring(useMotionValue(0), springCfg);
  const scale = useSpring(1, springCfg);

  function handleMouse(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const offsetX = e.clientX - rect.left - rect.width / 2;
    const offsetY = e.clientY - rect.top - rect.height / 2;
    rotateX.set((offsetY / (rect.height / 2)) * -10);
    rotateY.set((offsetX / (rect.width / 2)) * 10);
  }

  if (isTouch) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ height: '100%' }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseEnter={() => scale.set(1.03)}
      onMouseLeave={() => { scale.set(1); rotateX.set(0); rotateY.set(0); }}
      className="group"
      style={{ perspective: '800px', height: '100%' }}
    >
      <motion.div style={{ rotateX, rotateY, scale, transformStyle: 'preserve-3d', height: '100%' }}>
        {children}
      </motion.div>
    </div>
  );
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
        const withMinPrices: ModelPricing[] = await Promise.all(
          priced.map(async (m) => {
            try {
              const pricing = await api.get<{ data: { minDailyRate: number | null } }>(
                `/public/booking/model-pricing?storeId=${storeId}&vehicleModelId=${m.modelId}`,
              );
              return { ...m, minDailyRate: pricing.data.minDailyRate };
            } catch {
              return { ...m, minDailyRate: null };
            }
          }),
        );
        if (!cancelled) setModels(withMinPrices);
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
        .map((m) => {
          const lower = m.modelName.toLowerCase();
          const isTuk = lower.includes('tuk');
          const isBeat = lower.includes('honda beat') || lower.includes('beat');
          const info = isTuk ? FALLBACK_FLEET[1] : isBeat ? FALLBACK_FLEET[0] : null;
          return {
            key: m.modelId,
            name: info?.name ?? m.modelName,
            subtitle: info?.subtitle ?? '',
            price: m.minDailyRate != null
              ? `from ${formatCurrency(m.minDailyRate)}/day`
              : info != null
                ? `from ${formatCurrency(info.fallbackPrice)}/day`
                : m.dailyRate != null
                  ? `from ${formatCurrency(m.dailyRate)}/day`
                  : null,
            img: imageForModel(m.modelName),
            desc: info?.desc ?? '',
          };
        })
    : FALLBACK_FLEET.map((f) => ({
        key: f.name,
        name: f.name,
        subtitle: f.subtitle,
        price: `from ${formatCurrency(f.fallbackPrice)}/day`,
        img: f.img,
        desc: f.desc,
      }));

  return (
    <section style={{ position: 'relative', width: '100%' }}>
      <div className="mx-auto max-w-7xl px-6 py-16">
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
          alignItems: 'stretch',
        }}
      >
        {items.map((v, i) => (
          <div
            key={v.key}
            style={{ animationDelay: `${i * 100}ms`, height: '100%', display: 'flex', flexDirection: 'column' }}
            className="animate-card-enter"
          >
            <TiltableCard>
              <BorderGlow
                glowColor="36 96 67"
                backgroundColor="#FAF6F0"
                borderRadius={20}
                glowIntensity={1.2}
                coneSpread={30}
                colors={['#FCBC5A', '#F5A623', '#f1e6d6']}
                style={{ height: '100%' }}
              >
                {/* Image area — inside the unified card */}
                <div style={{
                  height: 220,
                  backgroundColor: '#FFFFFF',
                  borderRadius: '18px 18px 0 0',
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                  padding: '0 12px 8px',
                  margin: '-1px -1px 0',
                }}>
                  {v.img ? (
                    <img
                      src={v.img}
                      alt={v.name}
                      style={{
                        width: '95%',
                        height: '95%',
                        objectFit: 'contain',
                        objectPosition: 'center bottom',
                        mixBlendMode: 'multiply',
                        filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))',
                        marginTop: 'auto',
                        transition: 'transform 0.5s ease',
                      }}
                      className="group-hover:scale-105"
                    />
                  ) : (
                    <span style={{ fontSize: 64, opacity: 0.3 }}>🛵</span>
                  )}
                  {/* Price badge */}
                  <div style={{
                    position: 'absolute', bottom: 10, right: 10,
                    backgroundColor: 'rgba(255,255,255,0.95)',
                    borderRadius: 9999, padding: '3px 10px',
                    fontSize: 11, fontWeight: 700, color: '#00577C',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                  }}>
                    {loading ? '...' : v.price ?? 'See pricing'}
                  </div>
                </div>

                {/* Content area */}
                <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <p className="font-lato" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#00577C', marginBottom: 2 }}>
                    {v.name}
                  </p>
                  <h5
                    className="font-headline font-bold"
                    style={{ fontSize: 20, color: '#363737', marginBottom: 10 }}
                  >
                    {v.subtitle}
                  </h5>
                  <p
                    className="font-lato"
                    style={{ fontSize: 14, color: '#363737', opacity: 0.65, marginBottom: 20, lineHeight: 1.5, flex: 1 }}
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
              </BorderGlow>
            </TiltableCard>
          </div>
        ))}
      </div>

      </div>{/* end inner max-width container */}

      <img
        src={geckoSvg}
        alt=""
        style={{
          position: 'absolute',
          right: 0,
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
