interface Props {
  pickupLocationName?: string;
}

const TIPS = [
  {
    icon: '📍',
    title: 'Pickup Location',
    getDesc: (loc?: string) =>
      loc
        ? `${loc}. Look for the teal Lola's shack!`
        : "General Luna, near Cloud 9. Look for the teal Lola's shack!",
  },
  {
    icon: '🪪',
    title: "Driver's License",
    getDesc: () => 'Please ensure you have a valid license ready at pickup.',
  },
  {
    icon: '🪖',
    title: 'Gear Provided',
    getDesc: () => 'Two sanitized helmets and a full tank are included.',
  },
  {
    icon: '🐾',
    title: 'Paw Card Community',
    getDesc: () =>
      "You're now part of the Paw Card community — every rental helps feed and neuter stray animals on Siargao.",
  },
];

export function QuickTipsCard({ pickupLocationName }: Props) {
  return (
    <div className="w-full rounded-[2.5rem] bg-teal-brand p-8 text-left shadow-[0_20px_40px_rgba(26,122,110,0.2)]">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
          <span className="text-xl">💡</span>
        </div>
        <h3 className="font-headline text-xl font-extrabold text-white">Quick Tips</h3>
      </div>

      <ul className="flex flex-col gap-4 md:flex-row md:flex-wrap md:justify-center md:gap-8">
        {TIPS.map((tip) => (
          <li key={tip.title} className="flex gap-4 md:max-w-[200px] md:flex-col md:items-center md:gap-2 md:text-center">
            <span className="shrink-0 text-xl text-gold-brand md:shrink">{tip.icon}</span>
            <div>
              <p className="text-sm font-bold text-white">{tip.title}</p>
              <p className="text-xs leading-relaxed text-white/80">
                {tip.getDesc(pickupLocationName)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
