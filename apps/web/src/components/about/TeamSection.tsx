import { FadeUpSection } from '../public/FadeUpSection.js';
import lolaFace from '../../assets/Lola Face Cartoon.svg';

const pngs = import.meta.glob('../../assets/*.png', { eager: true, import: 'default' }) as Record<string, string>;

function pngUrl(name: string): string | undefined {
  const hit = Object.entries(pngs).find(([k]) => k.replace(/\\/g, '/').endsWith(`/${name}`));
  return hit ? (hit[1] as string) : undefined;
}

const TEAM = [
  { name: 'Jack', role: 'Founder', initials: 'JM', photo: undefined as string | undefined, cover: true },
  { name: 'Lola', role: 'Chief Happiness Officer', initials: 'L', photo: lolaFace, cover: false },
  { name: 'Jun', role: 'Operations', initials: 'J', photo: pngUrl('Jun.png'), cover: true },
  { name: 'Mico', role: 'Hospitality', initials: 'M', photo: pngUrl('Mico.png'), cover: true },
  { name: 'Nitz', role: 'Fleet', initials: 'N', photo: pngUrl('Nitz.png'), cover: true },
  { name: 'Reyland', role: 'Support', initials: 'R', photo: pngUrl('Reyland.png'), cover: true },
];

export function TeamSection() {
  return (
    <section className="rounded-t-[4rem] bg-sand-brand px-6 py-24">
      <div className="mx-auto max-w-7xl text-center">
        <h3 className="mb-16 font-headline text-4xl text-charcoal-brand">The Island Team</h3>
        <FadeUpSection>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-6">
            {TEAM.map((m) => (
              <div key={m.name} className="group space-y-4">
                <div className="aspect-square overflow-hidden rounded-xl bg-cream-brand shadow-md">
                  {m.photo ? (
                    <img
                      src={m.photo}
                      alt={m.name}
                      className={`h-full w-full transition-transform duration-300 group-hover:scale-105 ${
                        m.cover ? 'object-cover' : 'object-contain bg-cream-brand p-2'
                      }`}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-sand-brand">
                      <span className="font-headline text-3xl text-teal-brand">{m.initials}</span>
                    </div>
                  )}
                </div>
                <div>
                  <h5 className="font-headline text-xl text-teal-brand">{m.name}</h5>
                  <p className="text-xs font-semibold uppercase tracking-wider text-charcoal-brand/70">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </FadeUpSection>
      </div>
    </section>
  );
}
