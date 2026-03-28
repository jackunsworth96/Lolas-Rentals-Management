import { FadeUpSection } from '../public/FadeUpSection.js';

const ISSUES = [
  { title: 'Flat Tyre', icon: '🔧', body: 'Slowly pull over. Do not ride on a flat as it ruins the rim. Check for nails or thorns.', tag: 'Call support for mobile repair' },
  { title: 'Dead Battery', icon: '🔋', body: 'Check if lights were left on. Try kick-starting (if available) or wait 5 mins and try again.', tag: 'Check kickstand is UP' },
  { title: 'Running out of Fuel', icon: '⛽', body: 'The gauge can be tricky. If it sputters, find the nearest "Coke bottle" fuel stall (Sari-Sari store).', tag: 'Use Unleaded only' },
  { title: 'Chain Came Off', icon: '⚙️', body: 'Common on semi-autos. If safe, use a stick to guide the chain back onto the rear sprocket while rotating the wheel.', tag: 'Watch your fingers!' },
  { title: "Scooter Won't Start", icon: '🛑', body: 'Ensure the kickstand is fully up and you are squeezing the brake lever while pressing the start button.', tag: 'Check Kill Switch (Red button)' },
];

export function CommonIssuesSection() {
  return (
    <section className="mx-auto max-w-7xl px-6">
      <div className="mb-12 text-center">
        <h2 className="font-headline text-3xl font-bold text-teal-brand md:text-4xl">Common Issues &amp; Self-Fix Tips</h2>
        <p className="mx-auto mt-4 max-w-2xl text-charcoal-brand/70">
          Check these quick fixes before calling—they might save you a wait!
        </p>
      </div>
      <FadeUpSection>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {ISSUES.map((issue) => (
            <div
              key={issue.title}
              className="rounded-2xl bg-cream-brand p-8 shadow-[0_20px_40px_rgba(62,73,70,0.06)] transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-gold-brand text-xl">
                {issue.icon}
              </div>
              <h3 className="mb-3 text-xl font-bold text-teal-brand">{issue.title}</h3>
              <p className="mb-4 text-sm leading-relaxed text-charcoal-brand/80">{issue.body}</p>
              <span className="inline-block rounded-lg bg-sand-brand px-2 py-1 text-xs font-bold text-teal-brand">{issue.tag}</span>
            </div>
          ))}
        </div>
      </FadeUpSection>
    </section>
  );
}
