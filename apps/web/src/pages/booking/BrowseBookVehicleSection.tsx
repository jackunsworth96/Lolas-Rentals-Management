import { useMemo } from 'react';
import pawPrint from '../../assets/Paw Print.svg';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { VehicleCard } from '../../components/booking/VehicleCard.js';
import { WHATSAPP_URL } from '../../config/contact.js';
import { phoneIcon } from '../../components/public/customerContactIcons.js';

interface AvailableModel {
  modelId: string;
  modelName: string;
  availableCount: number;
  nextAvailablePickup?: string;
}

interface QuoteData {
  dailyRate: number;
  securityDeposit: number;
}

type Props = {
  isSearched: boolean;
  isLoading: boolean;
  availableModels: AvailableModel[] | undefined;
  quotes: Record<string, QuoteData>;
  pushToast: (msg: string, type: 'success' | 'error') => void;
};

function formatNextDate(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${date} at ${h}:${m} ${ampm}`;
}

export function BrowseBookVehicleSection({
  isSearched,
  isLoading,
  availableModels,
  quotes,
  pushToast,
}: Props) {
  const pricedModels = useMemo(
    () => (availableModels ?? []).filter((m) => (quotes[m.modelId]?.dailyRate ?? 0) > 0),
    [availableModels, quotes],
  );

  const allUnavailable = useMemo(() => {
    if (pricedModels.length === 0) return false;
    return pricedModels.every((m) => m.availableCount === 0);
  }, [pricedModels]);

  if (!isSearched) return null;

  return (
    <>
      <div className="my-6 flex justify-center">
        <img src={pawPrint} alt="" className="h-8 w-8 opacity-10 bg-transparent" />
      </div>

      <FadeUpSection className="relative z-10">
        <section>
          <div className="mb-6 flex flex-col items-center gap-1 text-center">
            <h2 className="font-headline text-3xl font-black tracking-tight text-teal-brand">
              Available Fleet <span className="text-gold-brand">Siargao</span>
            </h2>
            <p className="text-sm text-charcoal-brand/60">Select your ride and add to basket</p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse rounded-4xl bg-sand-brand">
                  <div className="h-64 rounded-t-4xl bg-sand-brand" />
                  <div className="space-y-3 p-6">
                    <div className="h-6 w-2/3 rounded bg-cream-brand" />
                    <div className="h-4 w-1/3 rounded bg-cream-brand" />
                    <div className="h-12 w-full rounded-3xl bg-cream-brand" />
                  </div>
                </div>
              ))}
            </div>
          ) : pricedModels.length === 0 ? (
            <div className="rounded-4xl bg-cream-brand px-8 py-16 text-center">
              <p className="mb-2 text-lg font-bold text-charcoal-brand">
                No vehicles available for these dates.
              </p>
              <p className="text-sm text-charcoal-brand/70">
                Try adjusting your dates or{' '}
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-teal-brand underline"
                >
                  <img src={phoneIcon} alt="" className="h-4 w-4 shrink-0 object-contain" width={16} height={16} />
                  contact us on WhatsApp
                </a>
                .
              </p>
              <p className="mt-4 text-sm text-charcoal-brand/70">
                You could also check our sister store{' '}
                <a
                  href="https://www.bassbikes.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-teal-brand underline"
                >
                  Bass Bikes
                </a>
                {' '}for availability.
              </p>
            </div>
          ) : (
            <>
              {allUnavailable && (
                <div className="mb-8 rounded-3xl border-2 border-gold-brand/30 bg-gold-brand/10 px-6 py-5 text-center">
                  <p className="mb-2 font-headline text-lg font-bold text-charcoal-brand">
                    All vehicles are booked for your selected dates
                  </p>
                  <div className="mb-3 space-y-1">
                    {pricedModels.filter((m) => m.nextAvailablePickup).map((m) => (
                      <p key={m.modelId} className="text-sm text-charcoal-brand/80">
                        The next available <span className="font-bold">{m.modelName}</span> is from{' '}
                        <span className="font-bold text-teal-brand">{formatNextDate(m.nextAvailablePickup!)}</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-sm text-charcoal-brand/70">
                    You could also check our sister store{' '}
                    <a
                      href="https://www.bassbikes.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-teal-brand underline underline-offset-2"
                    >
                      Bass Bikes
                    </a>
                    {' '}for availability.
                  </p>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-8">
                {pricedModels.map((m, index) => (
                  <div
                    key={m.modelId}
                    className="animate-card-enter"
                    style={{ animationDelay: `${index * 100}ms`, width: '100%', maxWidth: '380px' }}
                  >
                    <VehicleCard
                      modelId={m.modelId}
                      modelName={m.modelName}
                      availableCount={m.availableCount}
                      dailyRate={quotes[m.modelId]?.dailyRate ?? null}
                      securityDeposit={quotes[m.modelId]?.securityDeposit ?? null}
                      nextAvailablePickup={m.nextAvailablePickup}
                      onToast={pushToast}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </FadeUpSection>
    </>
  );
}
