import { useState, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { useCreateWalkIn } from '../../api/orders-raw.js';
import { useStores, useLocations } from '../../api/config.js';
import { useFleet } from '../../api/fleet.js';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Store { id: string; name: string; }
interface Location { id: number; name: string; }
interface FleetVehicle {
  id: string;
  name: string;
  modelId: string;
  status?: string;
}

const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined) ?? window.location.origin;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayTime(): string {
  const h = String(new Date().getHours()).padStart(2, '0');
  return `${h}:00`;
}

export function WalkInBookingModal({ open, onClose }: Props) {
  const createWalkIn = useCreateWalkIn();
  const { data: stores } = useStores() as { data: Store[] | undefined };

  // Form fields
  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [storeId, setStoreId] = useState('');
  const [vehicleModelId, setVehicleModelId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [pickupDate, setPickupDate] = useState(todayDate());
  const [pickupTime, setPickupTime] = useState(todayTime());
  const [dropoffDate, setDropoffDate] = useState(todayDate());
  const [dropoffTime, setDropoffTime] = useState(todayTime());
  const [pickupLocationId, setPickupLocationId] = useState<string>('');
  const [dropoffLocationId, setDropoffLocationId] = useState<string>('');
  const [staffNotes, setStaffNotes] = useState('');

  const { data: locations } = useLocations(storeId) as { data: Location[] | undefined };
  const { data: fleetVehicles } = useFleet(storeId) as { data: FleetVehicle[] | undefined };

  // Success state
  const [createdRef, setCreatedRef] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!open) {
      setCustomerName(''); setCustomerMobile(''); setCustomerEmail('');
      setStoreId(''); setVehicleModelId(''); setVehicleId('');
      setPickupDate(todayDate()); setPickupTime(todayTime());
      setDropoffDate(todayDate()); setDropoffTime(todayTime());
      setPickupLocationId(''); setDropoffLocationId(''); setStaffNotes('');
      setCreatedRef(null); setCopiedLink(false);
      createWalkIn.reset();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createWalkIn.mutate(
      {
        customerName: customerName.trim(),
        customerMobile: customerMobile.trim(),
        customerEmail: customerEmail.trim() || undefined,
        vehicleModelId,
        storeId,
        pickupDatetime: `${pickupDate}T${pickupTime}:00`,
        dropoffDatetime: `${dropoffDate}T${dropoffTime}:00`,
        pickupLocationId: pickupLocationId ? Number(pickupLocationId) : undefined,
        dropoffLocationId: dropoffLocationId ? Number(dropoffLocationId) : undefined,
        staffNotes: staffNotes.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          setCreatedRef(data.order_reference ?? data.id);
        },
      },
    );
  }

  const confirmationLink = createdRef ? `${SITE_URL}/book/confirmation/${createdRef}` : '';

  function handleCopyLink() {
    void navigator.clipboard.writeText(confirmationLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  const waText = encodeURIComponent(
    `Hi ${customerName}! Your booking at Lola's Rentals is confirmed. Reference: ${createdRef}. View details: ${confirmationLink}`,
  );
  const rawMobile = customerMobile.replace(/\D/g, '');
  const waMobile = rawMobile.startsWith('0') ? `63${rawMobile.slice(1)}` : rawMobile;
  const waUrl = `https://wa.me/${waMobile}?text=${waText}`;

  const isValid = customerName.trim() && customerMobile.trim() && storeId && vehicleModelId && pickupDate && pickupTime && dropoffDate && dropoffTime;

  return (
    <Modal open={open} onClose={onClose} title="Walk-in Booking" size="lg">
      {createdRef ? (
        /* ── Success state ── */
        <div className="space-y-5">
          <div className="rounded-xl bg-green-50 px-5 py-4 text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-green-600">Booking Created!</p>
            <p className="mt-2 text-3xl font-black tracking-wide text-gray-900">{createdRef}</p>
            <p className="mt-1 text-sm text-gray-500">
              Walk-in booking for <span className="font-medium text-gray-700">{customerName}</span>
            </p>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Share with customer</p>
            <div className="space-y-2">
              {/* Copy link */}
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                <span className="flex-1 truncate font-mono text-xs text-gray-600">{confirmationLink}</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-100"
                >
                  {copiedLink ? '✓ Copied!' : 'Copy link'}
                </button>
              </div>

              {/* WhatsApp */}
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Send via WhatsApp
              </a>
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      ) : (
        /* ── Form ── */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: Customer */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Customer</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-gray-700">Full name <span className="text-red-500">*</span></span>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Mobile <span className="text-red-500">*</span></span>
                <input
                  type="tel"
                  required
                  value={customerMobile}
                  onChange={(e) => setCustomerMobile(e.target.value)}
                  placeholder="e.g. 09171234567"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Email <span className="text-xs text-gray-400">(optional)</span></span>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="e.g. maria@example.com"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </label>
            </div>
          </section>

          {/* Section 2: Booking */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Booking</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Store <span className="text-red-500">*</span></span>
                <select
                  required
                  value={storeId}
                  onChange={(e) => { setStoreId(e.target.value); setPickupLocationId(''); setDropoffLocationId(''); }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Select store…</option>
                  {(stores ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-gray-700">Vehicle <span className="text-red-500">*</span></span>
                <select
                  required
                  value={vehicleId}
                  onChange={(e) => {
                    const selectedId = e.target.value;
                    setVehicleId(selectedId);
                    const vehicle = (fleetVehicles ?? []).find((v) => v.id === selectedId);
                    setVehicleModelId(vehicle?.modelId ?? '');
                  }}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="">Select vehicle…</option>
                  {(fleetVehicles ?? [])
                    .filter((v) => v.status !== 'Maintenance' && v.status !== 'Sold')
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                </select>
              </label>

              {/* Pickup */}
              <div className="block">
                <span className="text-sm font-medium text-gray-700">Pickup date <span className="text-red-500">*</span></span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    required
                    value={pickupDate}
                    onChange={(e) => setPickupDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    type="time"
                    required
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Return */}
              <div className="block">
                <span className="text-sm font-medium text-gray-700">Return date <span className="text-red-500">*</span></span>
                <div className="mt-1 flex gap-2">
                  <input
                    type="date"
                    required
                    value={dropoffDate}
                    onChange={(e) => setDropoffDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <input
                    type="time"
                    required
                    value={dropoffTime}
                    onChange={(e) => setDropoffTime(e.target.value)}
                    className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Pickup location */}
              {storeId && (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Pickup location <span className="text-xs text-gray-400">(optional)</span></span>
                  <select
                    value={pickupLocationId}
                    onChange={(e) => setPickupLocationId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="">— none —</option>
                    {(locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Dropoff location */}
              {storeId && (
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Return location <span className="text-xs text-gray-400">(optional)</span></span>
                  <select
                    value={dropoffLocationId}
                    onChange={(e) => setDropoffLocationId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="">— none —</option>
                    {(locations ?? []).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* Section 3: Notes */}
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400">Notes</h3>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Staff notes <span className="text-xs text-gray-400">(optional)</span></span>
              <textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                rows={3}
                placeholder="e.g. Customer prefers morning pickup. Paid cash deposit."
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </label>
          </section>

          {createWalkIn.error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {(createWalkIn.error as Error).message}
            </p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || createWalkIn.isPending}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createWalkIn.isPending ? 'Creating…' : 'Create Booking'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
