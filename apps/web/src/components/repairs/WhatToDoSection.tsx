import { FadeUpSection } from '../public/FadeUpSection.js';

const STEPS = [
  { n: '01', title: 'Stay Safe', body: 'Stay calm and move your scooter to a safe spot off the main road.' },
  { n: '02', title: 'Quick Check', body: 'Check for obvious issues like a flat tyre or a loose drive chain.' },
  { n: '03', title: "Call Lola's", body: 'Call us immediately at 09694443413 for assistance.' },
  { n: '04', title: "We're Coming", body: "We'll come to your location or arrange a replacement bike for you." },
];

export function WhatToDoSection() {
  return (
    <section className="mx-auto max-w-6xl px-6">
      <h2 className="mb-12 text-center font-headline text-3xl font-bold text-teal-brand md:text-4xl">What To Do</h2>
      <FadeUpSection>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div
              key={s.n}
              className="flex flex-col gap-4 rounded-2xl border-l-4 border-teal-brand bg-cream-brand p-8 shadow-[0_20px_40px_rgba(62,73,70,0.06)]"
            >
              <span className="text-4xl font-black text-gold-brand opacity-30">{s.n}</span>
              <h3 className="text-xl font-bold text-teal-brand">{s.title}</h3>
              <p className="leading-relaxed text-charcoal-brand/80">{s.body}</p>
            </div>
          ))}
        </div>
      </FadeUpSection>
    </section>
  );
}
