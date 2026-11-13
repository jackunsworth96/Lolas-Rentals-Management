import { useState } from 'react';
import { Badge } from '../../common/Badge.js';
import { OrderInvoicesBar } from '../../invoices/OrderInvoicesBar.js';
import type { RawOrder } from '../../../api/orders-raw.js';
import { formatCurrency } from '../../../utils/currency.js';
import { formatPickupDatetimeManila } from '../../../utils/date.js';
import { bookingDatetimeISO } from '../../../utils/booking-datetime.js';
import type { AddonRow, VehicleRow } from './types.js';

interface BookingSidePanelProps {
  rawOrder: RawOrder;
  isDirect: boolean;
  bookedModelName: string | null;
  requestedAddonNames: Array<{ id: number; name: string }> | null;
  lineItems: Array<Record<string, unknown>>;
  wcOrderNumber: string | null;
  customerNotes: string | null;
  partnerName: string | null;
  vehicles: VehicleRow[];
  enabledAddons: AddonRow[];
  transferAmount: number;
  transferPaidByCustomer: boolean;
  cardSurchargeAmount: number;
  surchargePercent: number;
  charityAmount: number;
  finalTotal: number;
  webQuote: number;
  waiverUrl: string | null;
  invoiceReference: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-gray-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-gray-900 break-words">{children}</dd>
    </div>
  );
}

function PriceLine({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <dt className="min-w-0 text-gray-600">{label}</dt>
      <dd className="shrink-0 tabular-nums">{formatCurrency(value)}</dd>
    </div>
  );
}

function shortDate(value: string): string {
  return new Date(bookingDatetimeISO(value)).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</h3>;
}

export function BookingSidePanel({
  rawOrder,
  isDirect,
  bookedModelName,
  requestedAddonNames,
  lineItems,
  wcOrderNumber,
  customerNotes,
  partnerName,
  vehicles,
  enabledAddons,
  transferAmount,
  transferPaidByCustomer,
  cardSurchargeAmount,
  surchargePercent,
  charityAmount,
  finalTotal,
  webQuote,
  waiverUrl,
  invoiceReference,
}: BookingSidePanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [waiverCopied, setWaiverCopied] = useState(false);
  const payload = (rawOrder.payload ?? {}) as Record<string, unknown>;

  const first = vehicles[0];
  const pickup = first?.pickupDatetime || rawOrder.pickup_datetime || '';
  const dropoff = first?.dropoffDatetime || rawOrder.dropoff_datetime || '';
  const pricedVehicles = vehicles.filter((v) => v.vehicleId || v.rentalRate > 0);
  const priced = pricedVehicles.length > 0;
  const deliveryFees = pricedVehicles.reduce((s, v) => s + v.pickupFee + v.dropoffFee, 0);
  const discounts = pricedVehicles.reduce((s, v) => s + v.discount, 0);
  const helmetCount = Number(payload.helmet_count ?? 0);
  const stayingAt = String(payload.accommodation_name ?? '').trim();

  const assignedNames = vehicles.filter((v) => v.vehicleId).map((v) => v.vehicleName).filter(Boolean).join(', ');
  const summaryParts = [
    assignedNames || bookedModelName || null,
    pickup && dropoff ? `${shortDate(pickup)} – ${shortDate(dropoff)}` : null,
    priced ? formatCurrency(finalTotal) : webQuote > 0 ? `Quote ${formatCurrency(webQuote)}` : null,
  ].filter(Boolean);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left lg:hidden"
      >
        <span className="min-w-0 truncate text-sm font-medium text-gray-900">
          {summaryParts.join(' · ') || 'Booking details'}
        </span>
        <span className="shrink-0 text-xs font-medium text-blue-600">{expanded ? 'Hide' : 'Details'}</span>
      </button>

      <div className={`${expanded ? 'block border-t border-gray-200' : 'hidden'} space-y-4 p-4 lg:block lg:border-t-0`}>
        <section>
          <SectionTitle>Booked</SectionTitle>
          <dl className="space-y-1.5 text-sm">
            {isDirect ? (
              <>
                {bookedModelName && <Row label="Model">{bookedModelName}</Row>}
                {pickup && <Row label="Pickup">{formatPickupDatetimeManila(bookingDatetimeISO(pickup))}</Row>}
                {dropoff && <Row label="Dropoff">{formatPickupDatetimeManila(bookingDatetimeISO(dropoff))}</Row>}
                <Row label="Customer paying by">{rawOrder.web_payment_method ?? 'Not specified'}</Row>
                {requestedAddonNames && requestedAddonNames.length > 0 && (
                  <div className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-gray-500">Add-ons</dt>
                    <dd className="min-w-0 text-right font-medium text-gray-900">
                      <ul className="space-y-0.5">
                        {requestedAddonNames.map((addon) => (
                          <li key={addon.id}>{addon.name}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                )}
                {rawOrder.transfer_type && (
                  <Row label="Transfer">
                    <span className="capitalize">{rawOrder.transfer_type}</span>
                    {rawOrder.transfer_route ? ` — ${rawOrder.transfer_route}` : ''}
                  </Row>
                )}
                {rawOrder.flight_number && <Row label="Flight">{rawOrder.flight_number}</Row>}
                {rawOrder.flight_arrival_time && (
                  <Row label="Arrival">
                    {new Date(rawOrder.flight_arrival_time as string).toLocaleString('en-PH', {
                      timeZone: 'Asia/Manila',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </Row>
                )}
                {helmetCount > 0 && <Row label="Extra helmets">{helmetCount}</Row>}
                {stayingAt && <Row label="Staying at">{stayingAt}</Row>}
                {rawOrder.partner_ref && partnerName && (
                  <Row label="Referred by"><span className="text-orange-700">{partnerName}</span></Row>
                )}
                {rawOrder.customer_company && <Row label="Company">{rawOrder.customer_company}</Row>}
                {rawOrder.pickup_location_address && <Row label="Pickup address">{rawOrder.pickup_location_address}</Row>}
                {rawOrder.dropoff_location_address && <Row label="Return address">{rawOrder.dropoff_location_address}</Row>}
              </>
            ) : (
              <>
                <Row label="WC order #">{wcOrderNumber ?? '—'}</Row>
                {pickup && <Row label="Pickup">{formatPickupDatetimeManila(bookingDatetimeISO(pickup))}</Row>}
                {dropoff && <Row label="Dropoff">{formatPickupDatetimeManila(bookingDatetimeISO(dropoff))}</Row>}
                {lineItems.length === 0 ? (
                  <p className="text-gray-500">No line items</p>
                ) : (
                  <div className="space-y-1 pt-1">
                    {lineItems.map((item, i) => (
                      <div key={i} className="flex justify-between gap-3 rounded bg-gray-50 px-2 py-1.5">
                        <span className="min-w-0">{String(item.name ?? 'Item')} x{String(item.quantity ?? 1)}</span>
                        <span className="shrink-0 font-medium">{formatCurrency(Number(item.total ?? 0))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </dl>
          {customerNotes && (
            <div className="mt-3 rounded-md bg-yellow-50 p-2.5 text-sm text-gray-800">
              <div className="mb-0.5 text-xs font-medium text-yellow-800">Customer comments</div>
              <p className="whitespace-pre-wrap">{customerNotes}</p>
            </div>
          )}
        </section>

        <section className="border-t border-gray-100 pt-4">
          <SectionTitle>Price</SectionTitle>
          {priced ? (
            <dl className="space-y-1.5 text-sm">
              {pricedVehicles.map((v, i) => (
                <PriceLine
                  key={i}
                  label={`${v.vehicleName || bookedModelName || 'Vehicle'} · ${v.rentalDaysCount}d × ${formatCurrency(v.rentalRate)}`}
                  value={v.rentalRate * v.rentalDaysCount}
                />
              ))}
              {deliveryFees > 0 && <PriceLine label="Delivery / collection" value={deliveryFees} />}
              {discounts !== 0 && <PriceLine label="Discount" value={-discounts} className="text-green-700" />}
              {enabledAddons.map((a, i) => (
                <PriceLine key={`addon-${i}`} label={a.addonName} value={a.totalAmount} />
              ))}
              {transferAmount > 0 && (
                transferPaidByCustomer ? (
                  <div className="flex justify-between gap-3 text-gray-500">
                    <dt>Airport transfer</dt>
                    <dd>Paid to driver</dd>
                  </div>
                ) : (
                  <PriceLine label="Airport transfer" value={transferAmount} />
                )
              )}
              {cardSurchargeAmount > 0 && (
                <PriceLine label={`Card surcharge (${surchargePercent}%)`} value={cardSurchargeAmount} className="text-amber-700" />
              )}
              {charityAmount > 0 && <PriceLine label="Charity donation" value={charityAmount} className="text-teal-700" />}
              <div className="flex items-baseline justify-between gap-3 border-t border-gray-900 pt-2">
                <dt className="font-bold text-gray-900">Total</dt>
                <dd className="text-lg font-bold tabular-nums text-gray-900">{formatCurrency(finalTotal)}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-gray-500">Assign a vehicle to price this order.</p>
          )}
          {webQuote > 0 && (
            <div className="mt-2 flex items-center justify-between gap-3 text-sm">
              <span className="text-gray-500">Website quote {formatCurrency(webQuote)}</span>
              {priced && (
                <Badge color={finalTotal > webQuote ? 'red' : finalTotal < webQuote ? 'green' : 'gray'}>
                  {finalTotal > webQuote
                    ? `+${formatCurrency(finalTotal - webQuote)}`
                    : finalTotal < webQuote
                      ? `-${formatCurrency(webQuote - finalTotal)}`
                      : 'Match'}
                </Badge>
              )}
            </div>
          )}
        </section>

        {waiverUrl && (
          <section className="border-t border-gray-100 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-gray-900">Customer waiver</h3>
                <p className="text-xs text-gray-500">Send the link or open it on their device.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(waiverUrl).then(() => {
                      setWaiverCopied(true);
                      setTimeout(() => setWaiverCopied(false), 2000);
                    });
                  }}
                  className="rounded-lg border border-teal-400 bg-white px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50"
                >
                  {waiverCopied ? 'Copied!' : 'Copy link'}
                </button>
                <a
                  href={waiverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-700"
                >
                  Open ↗
                </a>
              </div>
            </div>
          </section>
        )}

        <div className="border-t border-gray-100 pt-3 empty:hidden [&>div]:mb-0">
          <OrderInvoicesBar orderReference={invoiceReference} />
        </div>
      </div>
    </div>
  );
}
