import { motion, useReducedMotion, type TargetAndTransition, type Transition } from 'framer-motion';
import flowerLeft from '../../assets/Hero/flower-left.svg';
import flowerRight from '../../assets/Hero/flower-right.svg';
import cloud1 from '../../assets/Hero/cloud-left-to-right-1.svg';
import cloud2 from '../../assets/Hero/cloud-left-to-right-2.svg';
import cloud3 from '../../assets/Hero/cloud-left-to-right-3.svg';
import road from '../../assets/Original Assests/road.svg';
import { useLiveCustomerCount } from '../../hooks/useLiveCustomerCount.js';

const CLOUDS: Array<{ src: string; width: number; style: React.CSSProperties; drift: number; duration: number }> = [
  { src: cloud1, width: 170, style: { top: '9%', left: '5%' }, drift: 18, duration: 14 },
  { src: cloud3, width: 85, style: { top: '7%', right: '9%' }, drift: -14, duration: 11 },
  { src: cloud2, width: 130, style: { top: '4%', left: '46%' }, drift: 10, duration: 17 },
  { src: cloud1, width: 60, style: { top: '42%', left: '14%' }, drift: 14, duration: 19 },
  { src: cloud3, width: 105, style: { top: '24%', right: '18%' }, drift: -10, duration: 13 },
];

function Star() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="#FCBC5A" aria-hidden="true">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

/** Partner kiosks show the hotel's logo beside ours in the header. */
export interface CounterBrand {
  partnerName: string;
  logoUrl?: string | null;
  welcomeMessage?: string | null;
}

/** The tablet's attract screen, styled after the homepage hero. */
export function CounterWelcome({ onStart, brand }: { onStart: () => void; brand?: CounterBrand }) {
  const animate = !useReducedMotion();
  const explorers = Math.floor(useLiveCustomerCount() / 25) * 25;

  const float = (x: number, y: number, duration: number): { animate: TargetAndTransition; transition: Transition } => ({
    animate: animate ? { x: [0, x, 0], y: [0, y, 0] } : {},
    transition: { x: { duration, repeat: Infinity, ease: 'linear' }, y: { duration: duration / 2, repeat: Infinity, ease: 'easeInOut' } },
  });
  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: 'easeOut' as const, delay },
  });

  return (
    <div className="flex flex-1 flex-col">
      {CLOUDS.map((c, i) => (
        <motion.img
          key={i}
          src={c.src}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute z-0"
          style={{ ...c.style, width: c.width }}
          {...float(c.drift, -8, c.duration)}
        />
      ))}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-36 pt-12 text-center sm:pt-20">
        <h1 className="font-headline font-extrabold" style={{ fontSize: 'clamp(2.5rem, 7vw, 4.25rem)', lineHeight: 1.12 }}>
          <motion.span className="block text-teal-brand" {...fadeUp(0.1)}>Ready to ride?</motion.span>
          <motion.span
            className="block italic text-gold-brand"
            style={{ textShadow: '0.045em 0.045em 0 #363737' }}
            {...fadeUp(0.25)}
          >
            Let&apos;s get you on the road
          </motion.span>
        </h1>

        <motion.p className="mt-5 max-w-xl font-lato text-charcoal-brand" style={{ fontSize: 'clamp(17px, 2.4vw, 21px)', lineHeight: 1.6 }} {...fadeUp(0.45)}>
          {brand
            ? brand.welcomeMessage?.trim() || `Book a scooter delivered right here to ${brand.partnerName}. It takes about two minutes.`
            : 'Choose your vehicle and sign your waiver right here. It takes about two minutes.'}
        </motion.p>

        <motion.div
          className="mt-6 inline-flex items-center gap-4 rounded-full border border-charcoal-brand/10 bg-white/70 px-6 py-3 font-lato text-base text-charcoal-brand shadow-[0_4px_20px_rgba(54,55,55,0.06)]"
          {...fadeUp(0.55)}
        >
          <span>
            <span className="font-extrabold text-teal-brand">{explorers.toLocaleString('en-US')}+</span> explorers
          </span>
          <span className="flex items-center gap-0.5 border-x border-charcoal-brand/10 px-3">
            {[0, 1, 2, 3, 4].map((i) => <Star key={i} />)}
          </span>
          <span>
            <span className="font-extrabold text-teal-brand">5.0</span> Google Reviews
          </span>
        </motion.div>

        <motion.div
          className="mt-10"
          animate={animate ? { scale: [1, 1.03] } : {}}
          transition={{ delay: 1.2, duration: 2.4, repeat: Infinity, repeatType: 'mirror', ease: [0.45, 0, 0.55, 1] }}
        >
          <motion.div {...fadeUp(0.7)}>
            <button
              type="button"
              onClick={onStart}
              style={{ transform: 'skewX(-4deg)' }}
              className="rounded-[8px] border-2 border-charcoal-brand bg-gold-brand px-16 py-5 font-lato text-xl font-extrabold uppercase tracking-[0.05em] text-charcoal-brand shadow-[5px_5px_0_#363737] transition-shadow active:shadow-[2px_2px_0_#363737]"
            >
              <span className="inline-block" style={{ transform: 'skewX(4deg)' }}>Start booking</span>
            </button>
          </motion.div>
        </motion.div>
      </div>

      <motion.img
        src={flowerLeft}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-[2]"
        style={{ left: -24, bottom: 40, width: 'min(30vw, 300px)' }}
        {...float(-12, -8, 14)}
      />
      <motion.img
        src={flowerRight}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute z-[2]"
        style={{ right: -24, bottom: 40, width: 'min(36vw, 370px)' }}
        {...float(10, -5, 11)}
      />
      <img src={road} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 z-[1] block w-full" />
    </div>
  );
}
