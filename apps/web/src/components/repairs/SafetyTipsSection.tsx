import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CloudRain,
  PawPrint,
  Moon,
  Wind,
  Ban,
  HardHat,
  MessageCircleQuestion,
} from 'lucide-react';
import { FadeUpSection } from '../public/FadeUpSection.js';
import iconSafetyTips from '../../assets/Repairs/Safety Tips.svg';
const TIPS: Array<{ title: string; body: string; Icon: LucideIcon }> = [
  {
    Icon: AlertTriangle,
    title: 'Road Conditions',
    body: 'Watch out for sand on corners and potholes, especially after it rains. Take it slow!',
  },
  {
    Icon: CloudRain,
    title: 'Driving in Rain',
    body: 'Roads get very slippery instantly. Reduce speed by half and avoid sudden braking.',
  },
  {
    Icon: PawPrint,
    title: 'Dogs on the Road',
    body: 'Local dogs often sleep on the road. Be alert — they move slowly or not at all.',
  },
  {
    Icon: Moon,
    title: 'Night Driving',
    body: 'Street lights are rare outside GL. Drive slower and watch for pedestrians and unlit bikes.',
  },
  {
    Icon: Wind,
    title: 'Surf Rack Safety',
    body: 'Ensure your board is strapped tightly. The extra width can catch the wind on breezy days.',
  },
  {
    Icon: Ban,
    title: "Don't Drink & Drive",
    body: "Alcohol and island roads are a dangerous combination. Tricycles run all night — a ₱100 ride home beats a repair bill, or worse.",
  },
  {
    Icon: HardHat,
    title: 'Wear Your Helmet',
    body: "A helmet is provided with every rental — use it. It's the single most effective thing you can do to stay safe.",
  },
  {
    Icon: MessageCircleQuestion,
    title: "Don't Be Shy",
    body:
      "Need a lesson or even a refresher? Don't be shy — just ask. We'll take whatever time it takes until you feel confident and safe before you drive away.",
  },
];

export function SafetyTipsSection() {
  return (
    <div className="min-w-0">
      <FadeUpSection>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={iconSafetyTips}
              alt=""
              className="h-11 w-11 shrink-0 object-contain md:h-12 md:w-12"
              width={48}
              height={48}
            />
            <h2 className="font-headline text-3xl font-bold text-teal-brand">Island Safety Tips</h2>
          </div>

          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {TIPS.map((t) => (
              <li key={t.title}>
                <article className="flex h-full min-h-[200px] flex-col rounded-2xl bg-sand-brand/50 p-5 shadow-[0_12px_28px_rgba(62,73,70,0.08)]">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-brand/10">
                    <t.Icon className="h-5 w-5 shrink-0 text-teal-brand" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-2 font-headline text-base font-bold text-charcoal-brand">{t.title}</h3>
                  <p className="font-lato text-sm leading-relaxed text-charcoal-brand/80">{t.body}</p>
                </article>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border-l-4 border-teal-brand bg-sand-brand/50 px-6 py-5 md:px-8">
            <p className="font-lato text-sm leading-relaxed text-charcoal-brand md:text-base">
              <strong className="font-headline text-teal-brand">No rush, no race.</strong>{' '}
              There is nothing on this island worth speeding for — the roads are narrow, the scenery is beautiful, and everyone is taking it easy. Ease off the accelerator and enjoy the ride.
            </p>
          </div>
        </div>
      </FadeUpSection>
    </div>
  );
}
