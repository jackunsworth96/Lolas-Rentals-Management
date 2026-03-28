const STEPS = [
  { icon: '🔍', label: 'Browse', desc: 'Pick your ride from our community-focused fleet.', color: 'text-teal-brand' },
  { icon: '📱', label: 'Book', desc: 'Instant confirmation with secure online payments.', color: 'text-gold-brand' },
  { icon: '🌊', label: 'Ride', desc: 'Collect your keys and explore the island\'s soul.', color: 'text-teal-brand' },
];

export function HowItWorksSection() {
  return (
    <section className="bg-sand-brand/30 px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <h3 className="mb-16 text-center font-headline text-3xl font-black text-charcoal-brand">
          Three Steps to Paradise
        </h3>
        <div className="grid gap-12 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.label} className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-cream-brand shadow-[0_4px_20px_rgba(61,61,61,0.05)]">
                <span className={`text-3xl ${s.color}`}>{s.icon}</span>
              </div>
              <h6 className="mb-2 text-lg font-bold text-charcoal-brand">{s.label}</h6>
              <p className="text-sm text-charcoal-brand/70">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
