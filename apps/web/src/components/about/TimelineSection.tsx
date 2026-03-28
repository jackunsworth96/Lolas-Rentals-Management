import { FadeUpSection } from '../public/FadeUpSection.js';

const ITEMS = [
  {
    year: '2022',
    yearClass: 'text-gold-brand',
    dotClass: 'bg-gold-brand',
    title: "Lola's Rentals Opens",
    body: 'Be Pawsitive partnership begins',
  },
  {
    year: '2023',
    yearClass: 'text-teal-brand',
    dotClass: 'bg-teal-brand',
    title: 'Digital Expansion',
    body: 'Website launches, fleet expands',
    align: 'right' as const,
  },
  {
    year: '2024',
    yearClass: 'text-gold-brand',
    dotClass: 'bg-gold-brand',
    title: 'Bass Bikes Store Opens',
    body: 'Second store brings more variety',
  },
  {
    year: '2025',
    yearClass: 'text-teal-brand',
    dotClass: 'bg-teal-brand ring-8 ring-teal-brand/15',
    title: 'Siargao Paw Card Launches',
    body: 'Community loyalty scheme goes live',
    align: 'right' as const,
    largeDot: true,
  },
];

export function TimelineSection() {
  return (
    <section className="bg-cream-brand px-6 py-24">
      <div className="mx-auto max-w-4xl">
        <h3 className="mb-16 text-center font-headline text-4xl text-charcoal-brand">The Journey So Far</h3>
        <FadeUpSection>
          <div className="relative">
            <div
              className="absolute bottom-0 left-[11px] top-0 w-1.5 rounded-full bg-gold-brand/25 md:left-1/2 md:-translate-x-1/2"
              aria-hidden
            />
            <div className="relative space-y-0">
              {ITEMS.map((item, i) => (
                <div key={item.year} className={`relative pb-16 pl-10 md:pl-0 ${i === ITEMS.length - 1 ? 'pb-0' : ''}`}>
                  <div
                    className={`absolute left-0 top-0 z-10 rounded-full md:left-1/2 md:-translate-x-1/2 ${item.largeDot ? 'h-8 w-8' : 'h-6 w-6'} ${item.dotClass}`}
                  />
                  <div
                    className={
                      item.align === 'right'
                        ? 'md:mr-auto md:w-5/12 md:pr-12 md:text-right'
                        : 'md:ml-auto md:w-5/12 md:pl-12'
                    }
                  >
                    <span className={`mb-2 block font-headline text-2xl ${item.yearClass}`}>{item.year}</span>
                    <p className="mb-1 text-xl font-bold text-charcoal-brand">{item.title}</p>
                    <p className="text-charcoal-brand/70">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </FadeUpSection>
      </div>
    </section>
  );
}
