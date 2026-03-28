const REVIEWS = [
  {
    text: '"The best rental experience I\'ve had. Knowing my money helps the local pups makes exploring Cloud 9 even better!"',
    name: 'Sarah J.',
    role: 'DIGITAL NOMAD',
    initials: 'SJ',
  },
  {
    text: '"Clean bikes, easy process, and a genuinely great mission. The Tuk-Tuk was perfect for our surf crew\'s boards."',
    name: 'Marcus W.',
    role: 'SURFER',
    initials: 'MW',
  },
  {
    text: '"The inflatable kayak was a game changer for the lagoons. Excellent condition and the staff were so kind!"',
    name: 'Elena R.',
    role: 'SOLO TRAVELER',
    initials: 'ER',
  },
];

export function ReviewsSection() {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <div className="mb-4 flex justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className="text-xl text-gold-brand">⭐</span>
            ))}
          </div>
          <h3 className="mb-2 font-headline text-3xl font-black text-charcoal-brand">
            Loved by 500+ Explorers
          </h3>
          <p className="italic text-charcoal-brand/60">
            From all corners of the world, for one shared cause.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {REVIEWS.map((r) => (
            <div
              key={r.name}
              className="rounded-4xl bg-cream-brand p-8 shadow-[0_4px_20px_rgba(61,61,61,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md"
            >
              <p className="mb-6 text-sm italic leading-relaxed text-charcoal-brand">{r.text}</p>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-brand text-sm font-black text-teal-brand">
                  {r.initials}
                </div>
                <div>
                  <h6 className="text-sm font-bold text-charcoal-brand">{r.name}</h6>
                  <p className="text-[10px] font-black uppercase text-charcoal-brand/50">{r.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
