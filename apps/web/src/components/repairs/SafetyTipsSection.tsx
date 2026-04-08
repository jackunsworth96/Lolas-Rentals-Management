import { FadeUpSection } from '../public/FadeUpSection.js';

const TIPS = [
  { icon: '🏔️', title: 'Road Conditions', body: 'Watch out for sand on corners and potholes, especially after it rains. Take it slow!' },
  { icon: '🌧️', title: 'Driving in Rain', body: 'Roads get very slippery instantly. Reduce speed by half and avoid sudden braking.' },
  { icon: '🐕', title: 'Dogs on the Road', body: 'Local dogs often sleep on the road. Be alert, they move slowly or not at all.' },
  { icon: '🌙', title: 'Night Driving', body: 'Street lights are rare outside GL. Drive slower and watch for pedestrians and unlit bikes.' },
  { icon: '🏄', title: 'Surf Rack Safety', body: 'Ensure your board is strapped tightly. The extra width can catch the wind on breezy days.' },
];

export function SafetyTipsSection() {
  return (
    <div className="min-w-0">
      <FadeUpSection>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <span className="text-4xl text-gold-brand">🛡️</span>
            <h2 className="font-headline text-3xl font-bold text-teal-brand">Island Safety Tips</h2>
          </div>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {TIPS.map((t) => (
              <li key={t.title}>
                <article className="flex h-full min-h-[220px] flex-col rounded-2xl bg-sand-brand/50 p-5 shadow-[0_12px_28px_rgba(62,73,70,0.08)]">
                  <span className="mb-3 text-3xl text-gold-brand" aria-hidden>
                    {t.icon}
                  </span>
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
