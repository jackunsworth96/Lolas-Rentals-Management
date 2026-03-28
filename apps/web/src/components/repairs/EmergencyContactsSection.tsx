const MAP_EMBED =
  'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3151.835434509374!2d126.0774!3d9.8634!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zTG9sYSdzIFJlbnRhbHM!5e0!3m2!1sen!2sph!4v1234567890';

export function EmergencyContactsSection() {
  return (
    <section className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 lg:grid-cols-2">
      <div className="space-y-8">
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
            <p className="mt-1 text-xs font-bold italic text-gold-brand">Open: 8:00 AM - 6:00 PM</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-[400px] flex-col overflow-hidden rounded-xl shadow-[0_20px_40px_rgba(62,73,70,0.06)]">
        <iframe
          title="Lola's Rentals General Luna"
          src={MAP_EMBED}
          width="100%"
          height="400"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="min-h-[400px] flex-1 w-full"
        />
        <div className="bg-teal-brand p-6 text-white">
          <p className="font-bold">Find us in General Luna</p>
          <p className="text-sm opacity-80">Catangnan area — we&apos;re here when you need us.</p>
        </div>
      </div>
    </section>
  );
}
