/** Official Google Maps place link (opens in Maps app / browser). */
const MAPS_PLACE_URL =
  "https://www.google.com/maps/place/Lola's+Rentals/data=!4m2!3m1!1s0x0:0x48a08e679185497b?sa=X&ved=1t:2428&ictx=111";

/** Embedded map preview (search-based; pairs with MAPS_PLACE_URL for exact listing). */
const MAP_EMBED =
  "https://www.google.com/maps?q=Lola%27s%20Rentals%20Tourism%20Road%20Catangnan%20General%20Luna&output=embed";

/** Contacts, store info, and map (below Island Safety Tips on the repairs page). */
export function EmergencyContactsSection() {
  return (
    <div className="flex min-w-0 flex-col space-y-8">
      <h2 className="font-headline text-3xl font-bold text-teal-brand md:text-4xl">Emergency Contacts</h2>
      <div className="grid gap-4">
        <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-teal-brand p-3 text-white">📞</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gold-brand">Lola&apos;s Hotline</p>
              <p className="text-lg font-bold text-charcoal-brand">09694443413</p>
            </div>
          </div>
          <a href="tel:09694443413" className="font-bold text-teal-brand underline decoration-4 underline-offset-4">
            Call
          </a>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="rounded-full bg-teal-brand p-3 text-white">💬</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gold-brand">WhatsApp Support</p>
              <p className="text-lg font-bold text-charcoal-brand">Live Messaging</p>
            </div>
          </div>
          <a
            href="https://wa.me/639694443413"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-teal-brand underline decoration-4 underline-offset-4"
          >
            Chat
          </a>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl bg-sand-brand/60 p-8">
        <h3 className="flex items-center gap-2 text-xl font-bold text-charcoal-brand">
          <span className="text-teal-brand">📍</span> Store Location
        </h3>
        <div>
          <p className="font-bold text-teal-brand">Lola&apos;s Rentals (General Luna)</p>
          <p className="text-sm text-charcoal-brand/80">Tourism Road, Brgy. Catangnan, General Luna</p>
          <p className="mt-1 text-xs font-bold italic text-gold-brand">Open: 9:00 AM - 5:00 PM</p>
        </div>
      </div>

      <div className="flex min-h-[400px] flex-col overflow-hidden rounded-xl shadow-[0_20px_40px_rgba(62,73,70,0.06)]">
        <div className="relative min-h-[400px] flex-1">
          <a
            href={MAPS_PLACE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 font-lato text-xs font-bold text-teal-brand shadow-md transition-opacity hover:opacity-90"
          >
            Open in Maps
            <span aria-hidden className="inline-block text-[10px]">
              ↗
            </span>
          </a>
          <iframe
            title="Lola's Rentals General Luna"
            src={MAP_EMBED}
            width="100%"
            height="400"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="min-h-[400px] h-[400px] w-full"
          />
        </div>
        <a
          href={MAPS_PLACE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-teal-brand p-6 text-white transition-opacity hover:opacity-95"
        >
          <p className="font-bold">Find us in General Luna</p>
          <p className="text-sm opacity-80">Catangnan area — we&apos;re here when you need us.</p>
        </a>
      </div>
    </div>
  );
}
