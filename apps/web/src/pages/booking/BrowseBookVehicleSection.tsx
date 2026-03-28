import pawPrint from '../../assets/Paw Print.svg';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { VehicleCard } from '../../components/booking/VehicleCard.js';

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

export function BrowseBookVehicleSection({
  isSearched,
  isLoading,
  availableModels,
  quotes,
  pushToast,
}: Props) {
  if (!isSearched) return null;

  return (
    <>
      <div className="my-12 flex justify-center">
        <img src={pawPrint} alt="" className="h-10 w-10 opacity-10 bg-transparent" />
      </div>

      <FadeUpSection className="relative z-10">
        <section>
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-headline text-3xl font-black tracking-tight text-teal-brand">
              Available Fleet <span className="text-gold-brand">Siargao</span>
            </h2>
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
          ) : !availableModels || availableModels.length === 0 ? (
            <div className="rounded-4xl bg-cream-brand px-8 py-16 text-center">
              <p className="mb-2 text-lg font-bold text-charcoal-brand">
                No vehicles available for these dates.
              </p>
              <p className="text-sm text-charcoal-brand/70">
                Try adjusting your dates or{' '}
                <a
                  href="https://wa.me/639171234567"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-teal-brand underline"
                >
                  contact us on WhatsApp
                </a>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
              {availableModels.map((m, index) => (
                <div
                  key={m.modelId}
                  className="animate-card-enter"
                  style={{ animationDelay: `${index * 100}ms` }}
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
          )}
        </section>
      </FadeUpSection>
    </>
  );
}
