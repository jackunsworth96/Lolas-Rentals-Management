import { FadeUpSection } from '../public/FadeUpSection.js';
import iconNightDriving from '../../assets/Repairs/Night_Time.svg';
import iconSurfRackSafety from '../../assets/Repairs/Surf Rack Icon.svg';
import iconSafetyTips from '../../assets/Repairs/Safety Tips.svg';

const TIPS: Array<{
  title: string;
  body: string;
  icon: string;
  iconSrc?: string;
}> = [
  { icon: '🏔️', title: 'Road Conditions', body: 'Watch out for sand on corners and potholes, especially after it rains. Take it slow!' },
  { icon: '🌧️', title: 'Driving in Rain', body: 'Roads get very slippery instantly. Reduce speed by half and avoid sudden braking.' },
  { icon: '🐕', title: 'Dogs on the Road', body: 'Local dogs often sleep on the road. Be alert, they move slowly or not at all.' },
  {
    icon: '',
    iconSrc: iconNightDriving,
    title: 'Night Driving',
    body: 'Street lights are rare outside GL. Drive slower and watch for pedestrians and unlit bikes.',
  },
  {
    icon: '',
    iconSrc: iconSurfRackSafety,
    title: 'Surf Rack Safety',
    body: 'Ensure your board is strapped tightly. The extra width can catch the wind on breezy days.',
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
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TIPS.map((t) => (
              <li key={t.title}>
                <article className="flex h-full min-h-[220px] flex-col rounded-2xl bg-sand-brand/50 p-5 shadow-[0_12px_28px_rgba(62,73,70,0.08)]">
                  {t.iconSrc ? (
                    <img
                      src={t.iconSrc}
                      alt=""
                      className="mb-3 h-11 w-11 shrink-0 object-contain"
                      width={44}
                      height={44}
                      aria-hidden
                    />
                  ) : (
                    <span className="mb-3 text-3xl text-gold-brand" aria-hidden>
                      {t.icon}
                    </span>
                  )}
                  <h3 className="mb-2 font-headline text-base font-bold text-charcoal-brand">{t.title}</h3>
                  <p className="text-sm leading-relaxed text-charcoal-brand/85">{t.body}</p>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </FadeUpSection>
    </div>
  );
}
