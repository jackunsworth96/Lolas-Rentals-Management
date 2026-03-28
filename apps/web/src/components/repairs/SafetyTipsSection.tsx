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
    <section className="mx-auto max-w-4xl px-6">
      <FadeUpSection>
        <div className="rounded-3xl bg-sand-brand/50 p-10 shadow-[0_20px_40px_rgba(62,73,70,0.06)] md:p-12">
          <div className="mb-10 flex items-center gap-4">
            <span className="text-4xl text-gold-brand">🛡️</span>
            <h2 className="font-headline text-3xl font-bold text-teal-brand">Island Safety Tips</h2>
          </div>
          <div className="space-y-8">
            {TIPS.map((t) => (
              <div key={t.title} className="flex gap-6">
                <span className="text-3xl text-gold-brand">{t.icon}</span>
                <div>
                  <h4 className="mb-1 text-lg font-bold text-charcoal-brand">{t.title}</h4>
                  <p className="text-charcoal-brand/80">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeUpSection>
    </section>
  );
}
