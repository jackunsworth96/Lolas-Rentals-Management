import { GOOGLE_MAPS_EMBED_URL, GOOGLE_MAPS_PLACE_URL } from '../../config/maps.js';
import { phoneIcon, messageIcon, locationIcon } from '../public/customerContactIcons.js';

/** Contacts, store info, and map (below Island Safety Tips on the repairs page). */
export function EmergencyContactsSection() {
  return (
    <div className="flex min-w-0 flex-col space-y-8">
      <h2 className="font-headline text-3xl font-bold text-teal-brand md:text-4xl">Emergency Contacts</h2>
      <div className="grid gap-8 md:grid-cols-2 md:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-brand p-2">
                <img src={phoneIcon} alt="" className="h-8 w-8 object-contain" width={32} height={32} />
              </div>
              <div className="flex flex-col gap-0">
                <p className="text-sm font-bold uppercase tracking-widest leading-tight text-teal-brand">Lola&apos;s Reception</p>
                <p className="text-lg font-bold leading-tight text-charcoal-brand">09694443413</p>
              </div>
            </div>
            <a href="tel:09694443413" className="shrink-0 font-bold text-teal-brand underline decoration-4 underline-offset-4">
              Call
            </a>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-brand p-2">
                <img src={messageIcon} alt="" className="h-8 w-8 object-contain" width={32} height={32} />
              </div>
              <div className="flex flex-col gap-0">
                <p className="text-sm font-bold uppercase tracking-widest leading-tight text-teal-brand">WhatsApp Support</p>
                <p className="text-lg font-bold leading-tight text-charcoal-brand">Live Messaging</p>
              </div>
            </div>
            <a
              href="https://wa.me/639694443413"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 font-bold text-teal-brand underline decoration-4 underline-offset-4"
            >
              Chat
            </a>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
            <div className="flex min-w-0 flex-col gap-0 pr-4">
              <p className="text-sm font-bold uppercase tracking-widest leading-tight text-teal-brand">National Emergency Hotline</p>
              <p className="text-lg font-bold leading-tight text-charcoal-brand">911</p>
            </div>
            <a href="tel:911" className="shrink-0 font-bold text-teal-brand underline decoration-4 underline-offset-4">
              Call
            </a>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
            <div className="flex min-w-0 flex-col gap-0 pr-4">
              <p className="text-sm font-bold uppercase tracking-widest leading-tight text-teal-brand">Police Station (General Luna)</p>
              <p className="text-lg font-bold leading-tight text-charcoal-brand">09985987338</p>
            </div>
            <a href="tel:+639985987338" className="shrink-0 font-bold text-teal-brand underline decoration-4 underline-offset-4">
              Call
            </a>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-cream-brand p-6 shadow-sm">
            <div className="flex min-w-0 flex-col gap-0 pr-4">
              <p className="text-sm font-bold uppercase tracking-widest leading-tight text-teal-brand">Tourist Police (General Luna)</p>
              <p className="text-lg font-bold leading-tight text-charcoal-brand">09093365618</p>
            </div>
            <a href="tel:+639093365618" className="shrink-0 font-bold text-teal-brand underline decoration-4 underline-offset-4">
              Call
            </a>
          </div>
        </div>
      </div>

      <div className="space-y-6 rounded-2xl bg-sand-brand/60 p-8">
        <h3 className="flex items-center gap-2 text-xl font-bold text-charcoal-brand">
          <img src={locationIcon} alt="" className="h-7 w-7 shrink-0 object-contain" width={28} height={28} />
          Store Location
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
            href={GOOGLE_MAPS_PLACE_URL}
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
            src={GOOGLE_MAPS_EMBED_URL}
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
          href={GOOGLE_MAPS_PLACE_URL}
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
