import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PawCardEstablishment } from '../../api/paw-card-establishments.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';
import { PARTNER_LOGO_CACHE_BUST } from '../../lib/cloudinary.js';
import { resolveEstablishmentCloudinaryId } from '../paw-card/partner-marquee-public-ids.js';
import { CATEGORY_MAP, getInitials } from '../paw-card/partner-display.js';

export const AUTO_ADVANCE_MS = 3500;
const RESUME_AFTER_MS = 6000;
const MAX_LOGO = 240;
/** Horizontal distance from centre, in logo widths, for slides 0..3 away from the active one. */
const SPREAD = [0, 0.95, 1.6, 2.1];
const SCALE = [1, 0.65, 0.45, 0.35];
const OPACITY = [1, 0.6, 0.3, 0];

const mod = (n: number, m: number) => ((n % m) + m) % m;

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(1024);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function useOnScreen(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    const onVisibility = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    let observer: IntersectionObserver | undefined;
    if (el && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting && document.visibilityState === 'visible'));
      observer.observe(el);
    }
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ref]);
  return visible;
}

function LogoDisc({ partner, size, active }: { partner: PawCardEstablishment; size: number; active: boolean }) {
  const logoPublicId = resolveEstablishmentCloudinaryId(partner.cloudinary_public_id, partner.name ?? '');
  return (
    <div
      className={`relative flex items-center justify-center rounded-full border-2 border-charcoal-brand bg-white ${
        active ? 'shadow-[6px_6px_0_#363737]' : 'shadow-[3px_3px_0_rgba(54,55,55,0.35)]'
      }`}
      style={{ width: size, height: size }}
    >
      <div className="h-full w-full overflow-hidden rounded-full">
        {logoPublicId ? (
          <CloudinaryImage
            publicId={logoPublicId}
            alt={partner.name ?? ''}
            className="pointer-events-none h-full w-full select-none object-contain p-[12%]"
            cacheBust={PARTNER_LOGO_CACHE_BUST}
            plugins={[]}
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-headline font-bold text-teal-brand" style={{ fontSize: size * 0.3 }}>
            {getInitials(partner.name)}
          </span>
        )}
      </div>
      {partner.is_favourite && (
        <span
          className="absolute -top-1 right-[2%] whitespace-nowrap rounded-full border-2 border-charcoal-brand bg-gold-brand px-3 py-1 font-lato text-xs font-extrabold uppercase tracking-wide text-charcoal-brand"
          style={{ transform: 'rotate(8deg)' }}
        >
          Lola&apos;s favourite
        </span>
      )}
    </div>
  );
}

/** Card-less coverflow of Paw Card partner logos that drifts on its own until someone touches it. */
export function PartnerCarousel({ partners }: { partners: PawCardEstablishment[] }) {
  const reduceMotion = useReducedMotion();
  const [rootRef, width] = useContainerWidth<HTMLDivElement>();
  const onScreen = useOnScreen(rootRef);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout>>();
  const dragged = useRef(false);

  const count = partners.length;
  const size = Math.min(MAX_LOGO, width * 0.42);
  const autoplay = !reduceMotion && !userPaused && onScreen && count > 1;
  const active = partners[mod(index, count)];

  const holdOff = useCallback(() => {
    setUserPaused(true);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setUserPaused(false), RESUME_AFTER_MS);
  }, []);

  useEffect(() => () => clearTimeout(resumeTimer.current), []);

  useEffect(() => {
    if (!autoplay) return;
    const t = setTimeout(() => setIndex((i) => i + 1), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, [autoplay, index]);

  const go = (steps: number) => {
    holdOff();
    setIndex((i) => i + steps);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const spacing = size * SPREAD[1]!;
    const projected = info.offset.x + info.velocity.x * 0.2;
    let steps = -Math.round(projected / spacing);
    if (steps === 0 && Math.abs(info.offset.x) > 40) steps = info.offset.x < 0 ? 1 : -1;
    steps = Math.max(-3, Math.min(3, steps));
    if (steps) go(steps);
    else holdOff();
    setTimeout(() => { dragged.current = false; }, 0);
  };

  if (!active) return null;

  const reach = count > 1 ? 3 : 0;
  const offsets = Array.from({ length: reach * 2 + 1 }, (_, i) => i - reach);
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 120, damping: 22, mass: 1 };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Paw Card partners"
      className="relative select-none"
      onPointerDown={holdOff}
    >
      <div className="relative">
        <motion.div
          className="relative cursor-grab touch-pan-y active:cursor-grabbing"
          style={{ height: size + 24 }}
          drag={count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.35}
          dragSnapToOrigin
          onDragStart={() => { dragged.current = true; }}
          onDragEnd={onDragEnd}
        >
          {offsets.map((o) => {
            const pos = index + o;
            const partner = partners[mod(pos, count)]!;
            const dist = Math.abs(o);
            return (
              <motion.button
                key={pos}
                type="button"
                tabIndex={dist === 1 ? 0 : -1}
                aria-hidden={dist > 1}
                aria-label={o === 0 ? undefined : `Show ${partner.name}`}
                onClick={() => { if (!dragged.current && o !== 0) go(o); }}
                className="absolute left-1/2 top-3"
                style={{ marginLeft: -size / 2, zIndex: 10 - dist }}
                initial={false}
                animate={{
                  x: Math.sign(o) * SPREAD[dist]! * size,
                  scale: SCALE[dist],
                  opacity: OPACITY[dist],
                  filter: `blur(${dist}px)`,
                }}
                transition={transition}
              >
                <LogoDisc partner={partner} size={size} active={o === 0} />
              </motion.button>
            );
          })}
        </motion.div>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous partner"
              onClick={() => go(-1)}
              className="absolute left-0 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-charcoal-brand bg-white/90 text-charcoal-brand shadow-[3px_3px_0_#363737] active:shadow-[1px_1px_0_#363737]"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Next partner"
              onClick={() => go(1)}
              className="absolute right-0 top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border-2 border-charcoal-brand bg-white/90 text-charcoal-brand shadow-[3px_3px_0_#363737] active:shadow-[1px_1px_0_#363737]"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
      </div>

      <div className="relative mx-auto mt-8 min-h-[11rem] max-w-xl text-center" aria-live={autoplay ? 'off' : 'polite'}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${index}-${active.id}`}
            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <p
              className="font-headline font-extrabold text-charcoal-brand"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', lineHeight: 1.1 }}
            >
              {active.discount_headline}
            </p>
            <p className="mt-2 font-lato text-xl font-bold text-teal-brand">{active.name}</p>
            <p className="mt-3 font-lato text-xs font-bold uppercase tracking-[0.15em] text-charcoal-brand/50">
              {CATEGORY_MAP[active.category] ?? active.category}
            </p>
            {active.discount_conditions && (
              <p className="mt-1 font-lato text-base text-charcoal-brand/70">{active.discount_conditions}</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <div className="mx-auto mt-2 flex max-w-xs items-center gap-4">
          <span className="font-lato text-lg font-bold tabular-nums text-charcoal-brand">
            {String(mod(index, count) + 1).padStart(2, '0')}
            <span className="text-charcoal-brand/40"> / {String(count).padStart(2, '0')}</span>
          </span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-charcoal-brand/10">
            <motion.div
              key={`${index}-${autoplay}`}
              className="h-full origin-left rounded-full bg-gold-brand"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: autoplay ? 1 : 0 }}
              transition={autoplay ? { duration: AUTO_ADVANCE_MS / 1000, ease: 'linear' } : { duration: 0 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
