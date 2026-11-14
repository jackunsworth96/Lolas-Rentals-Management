import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { whatsAppNumberError } from '../common/WhatsAppNumberInput.js';
import { useFleet, availableVehiclesQuery } from '../../api/fleet.js';
import { bookingDatetimeISO } from '../../utils/booking-datetime.js';
import {
  extractPickupDropoffFromPayload,
  extractPickupLocation,
  extractDropoffLocation,
  normalizeLocationName,
  toDatetimeLocal,
} from '../../utils/raw-order-payload.js';
import { useAddons, useLocations, useChartOfAccounts, useStorePricing, usePaymentMethods, useVehicleModels } from '../../api/config.js';
import { useProcessRawOrder, useCollectPayment, type RawOrder, type ProcessRawOrderPayload } from '../../api/orders-raw.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { resolveStoreFromSource } from '@lolas/shared';
import { InspectionModal } from './InspectionModal.js';
import { useSurfRackAvailability } from '../../api/surf-racks.js';
import { isSurfRackAddon } from '../basket/AddOnsSection.js';
import { surfRackShortfall } from './SurfRackAvailabilityNote.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { fetchPublicPartnerBenefit } from '../../api/partners.js';
import {
  partnerAllowsFreeDeliveryLocation,
  partnerEstablishmentLocation,
} from '../../utils/partnerDeliveryLocation.js';
import { OrderRefChip } from './OrderRefChip.js';
import { BookingStepper } from './booking/BookingStepper.js';
import { BookingSidePanel } from './booking/BookingSidePanel.js';
import { CustomerStep } from './booking/CustomerStep.js';
import { VehicleStep } from './booking/VehicleStep.js';
import { PaymentStep } from './booking/PaymentStep.js';
import type { AddonRow, CustomerData, VehicleRow } from './booking/types.js';

interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  rawOrder: RawOrder;
  /** When set, "Walk-in booking" in the vehicles step closes this modal and runs this (e.g. open walk-in on Inbox). */
  onWalkInBooking?: () => void;
}

type Step = 'review' | 'vehicles' | 'summary';
const STEPS: { key: Step; label: string }[] = [
  { key: 'review', label: 'Customer' },
  { key: 'vehicles', label: 'Vehicle & add-ons' },
  { key: 'summary', label: 'Payment & activate' },
];

function isStoreLocation(loc: Record<string, unknown>): boolean {
  const collection = Number(loc.collectionCost ?? loc.collection_cost ?? 0);
  const delivery = Number(loc.deliveryCost ?? loc.delivery_cost ?? 0);
  const type = loc.locationType ?? loc.location_type ?? null;
  return collection === 0 && delivery === 0 && (type === 'store' || type === null);
}

function extractBilling(payload: Record<string, unknown>) {
  const billing = payload.billing as Record<string, unknown> | undefined;
  return {
    name: `${billing?.first_name ?? ''} ${billing?.last_name ?? ''}`.trim() || String(payload.customer_name ?? ''),
    email: String(billing?.email ?? payload.email ?? ''),
    phone: String(billing?.phone ?? payload.phone ?? ''),
  };
}

function extractLineItems(payload: Record<string, unknown>): Array<Record<string, unknown>> {
  const items = payload.line_items;
  return Array.isArray(items) ? items : [];
}

function extractPayloadAddonNames(payload: Record<string, unknown>): Set<string> {
  const names = new Set<string>();
  const lineItems = extractLineItems(payload);
  for (const item of lineItems) {
    const meta = item.meta_data as Array<{ key: string; value: unknown }> | undefined;
    if (!Array.isArray(meta)) continue;
    for (const m of meta) {
      if (m.key === 'rnb_hidden_order_meta') {
        const hidden = m.value as Record<string, unknown> | undefined;
        const resources = hidden?.payable_resource;
        if (Array.isArray(resources)) {
          for (const r of resources as Array<{ name?: string }>) {
            if (r.name) names.add(r.name.trim().toLowerCase());
          }
        }
        const cats = hidden?.payable_cat;
        if (Array.isArray(cats)) {
          for (const c of cats as Array<{ name?: string }>) {
            if (c.name) names.add(c.name.trim().toLowerCase());
          }
        }
      }
      if (m.key === 'Resources' && typeof m.value === 'string') {
        const raw = m.value.replace(/<[^>]*>/g, '').trim();
        const match = raw.match(/^(.+?)\s*\(/);
        if (match) names.add(match[1].trim().toLowerCase());
        else names.add(raw.toLowerCase());
      }
    }
  }
  return names;
}

function storeIdFromSource(source: string): string {
  return resolveStoreFromSource(source);
}

function calcDays(pickup: string, dropoff: string): number {
  if (!pickup || !dropoff) return 1;
  const diff = new Date(dropoff).getTime() - new Date(pickup).getTime();
  const hours = diff / (1000 * 60 * 60);
  return Math.max(1, Math.ceil(hours / 24));
}

interface PricingTier {
  modelId: string;
  minDays: number;
  maxDays: number;
  dailyRate: number;
}

export function findRate(
  modelId: string | null | undefined,
  days: number,
  tiers: PricingTier[],
): number | null {
  if (!modelId || !tiers || tiers.length === 0) return null;
  const match = tiers.find(
    (t) => t.modelId === modelId && days >= t.minDays && days <= t.maxDays,
  );
  return match ? match.dailyRate : null;
}

function emptyVehicleRow(): VehicleRow {
  return {
    vehicleId: '',
    vehicleName: '',
    pickupDatetime: '',
    dropoffDatetime: '',
    rentalDaysCount: 1,
    pickupLocation: '',
    dropoffLocation: '',
    pickupFee: 0,
    dropoffFee: 0,
    rentalRate: 0,
    helmetNumbers: '',
    discount: 0,
    opsNotes: '',
    isExtension: false,
  };
}

function locationId(loc: Record<string, unknown> | undefined): number | null {
  const id = Number(loc?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function BookingModal({ open, onClose, rawOrder, onWalkInBooking }: BookingModalProps) {
  const storeId = storeIdFromSource(rawOrder.source);
  const isDirect = rawOrder.booking_channel === 'direct' || rawOrder.booking_channel === 'walk_in';
  const payload = rawOrder.payload ?? {};
  const employeeName = useAuthStore((s) => s.user?.username ?? 'Staff');
  const canEditOrders = useAuthStore((s) => s.hasPermission('can_edit_orders'));

  const waiverRef = isDirect
    ? (rawOrder.order_reference ?? null)
    : (String(payload.number ?? payload.id ?? '') || null);
  const waiverUrl = waiverRef
    ? `${window.location.origin}/waiver/${encodeURIComponent(waiverRef)}`
    : null;

  const billing = useMemo(() => {
    if (isDirect) {
      return {
        name: rawOrder.customer_name ?? '',
        email: rawOrder.customer_email ?? '',
        phone: rawOrder.customer_mobile ?? '',
      };
    }
    return extractBilling(payload);
  }, [isDirect, rawOrder.customer_name, rawOrder.customer_email, rawOrder.customer_mobile, payload]);

  const lineItems = useMemo(() => (isDirect ? [] : extractLineItems(payload)), [isDirect, payload]);
  const webQuote = isDirect
    ? (rawOrder.web_quote_raw ?? 0)
    : Number(payload.total ?? payload.order_total ?? payload.web_quote ?? 0) || 0;

  const [step, setStep] = useState<Step>('review');
  const [inspectionOpen, setInspectionOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerData>(billing);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([emptyVehicleRow()]);
  const [selectedAddons, setSelectedAddons] = useState<AddonRow[]>([]);
  const [securityDeposit, setSecurityDeposit] = useState<number | ''>('');
  const [successMessage, setSuccessMessage] = useState('');
  const [payloadPickupLoc, setPayloadPickupLoc] = useState('');
  const [payloadDropoffLoc, setPayloadDropoffLoc] = useState('');
  const [paymentMethodId, setPaymentMethodId] = useState('');
  const [depositMethodId, setDepositMethodId] = useState('');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [depositLiabilityAccountId, setDepositLiabilityAccountId] = useState('');
  const [waiveCardFee, setWaiveCardFee] = useState(false);
  const [collectPaymentNote, setCollectPaymentNote] = useState('');
  const [settlementRef, setSettlementRef] = useState('');
  const [waiveDeposit, setWaiveDeposit] = useState(false);
  const [transferPaidByCustomer, setTransferPaidByCustomer] = useState(false);
  const [transferAccommodation, setTransferAccommodation] = useState(
    () => String((rawOrder.payload as Record<string, unknown> | null)?.accommodation_name ?? ''),
  );
  const [preActivationMethodId, setPreActivationMethodId] = useState('');
  const [preActivationRef, setPreActivationRef] = useState('');
  const [preActivationAmount, setPreActivationAmount] = useState<number | ''>('');
  const [collectNowAmount, setCollectNowAmount] = useState<number | ''>('');
  const [dropoffLocationNote, setDropoffLocationNote] = useState('');
  const { data: vehicleModels } = useVehicleModels() as { data: Array<{ id: string; name: string }> | undefined };
  const { data: fleet } = useFleet(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const { data: storeAddons } = useAddons(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const requestedAddonNames = useMemo(() => {
    const ids = rawOrder.addon_ids ?? [];
    if (!isDirect || ids.length === 0 || !storeAddons) return null;
    const byId = new Map<number, string>();
    for (const addon of storeAddons) {
      const name = String(addon.name ?? '').trim();
      const id = Number(addon.id);
      if (name && Number.isInteger(id)) byId.set(id, name);
    }
    const seen = new Set<number>();
    const names: Array<{ id: number; name: string }> = [];
    for (const rawId of ids) {
      const id = Number(rawId);
      if (!Number.isInteger(id) || seen.has(id)) continue;
      seen.add(id);
      names.push({ id, name: byId.get(id) ?? `Add-on #${id}` });
    }
    return names;
  }, [isDirect, rawOrder.addon_ids, storeAddons]);
  const { data: locations } = useLocations(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const { data: accounts } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: storePricing } = useStorePricing(storeId) as { data: PricingTier[] | undefined };
  const { data: paymentMethods } = usePaymentMethods() as { data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean; isDepositEligible?: boolean; is_deposit_eligible?: boolean }> | undefined };
  const { data: partnerBenefit } = useQuery({
    queryKey: ['raw-order-partner-benefit', rawOrder.partner_ref],
    queryFn: () => fetchPublicPartnerBenefit(String(rawOrder.partner_ref ?? '')),
    enabled: Boolean(rawOrder.partner_ref),
    staleTime: 5 * 60_000,
  });
  const partnerPickupLocationOption = partnerEstablishmentLocation(
    partnerBenefit,
    rawOrder.pickup_location_id != null ? Number(rawOrder.pickup_location_id) : null,
    rawOrder.vehicle_model_id,
  );
  const partnerDropoffLocationOption = partnerEstablishmentLocation(
    partnerBenefit,
    rawOrder.dropoff_location_id != null ? Number(rawOrder.dropoff_location_id) : null,
    rawOrder.vehicle_model_id,
  );

  function effectiveLocationFee(
    loc: Record<string, unknown> | undefined,
    kind: 'pickup' | 'dropoff',
  ) {
    if (!loc) return 0;
    const rawFee = kind === 'pickup'
      ? Number(loc.deliveryCost ?? loc.fee ?? 0)
      : Number(loc.collectionCost ?? loc.fee ?? 0);
    return partnerAllowsFreeDeliveryLocation(
      partnerBenefit,
      locationId(loc),
      rawOrder.vehicle_model_id,
    ) ? 0 : rawFee;
  }

  function locationOptionLabel(loc: Record<string, unknown>, kind: 'pickup' | 'dropoff') {
    const rawFee = kind === 'pickup'
      ? Number(loc.deliveryCost ?? loc.fee ?? 0)
      : Number(loc.collectionCost ?? loc.fee ?? 0);
    if (rawFee <= 0) return String(loc.name);
    if (partnerAllowsFreeDeliveryLocation(partnerBenefit, locationId(loc), rawOrder.vehicle_model_id)) {
      return `${String(loc.name)} (Free - was ${formatCurrency(rawFee)})`;
    }
    return `${String(loc.name)} (${formatCurrency(rawFee)})`;
  }

  const directModelName = useMemo(() => {
    if (!isDirect || !rawOrder.vehicle_model_id || !vehicleModels) return null;
    const match = vehicleModels.find((m) => m.id === rawOrder.vehicle_model_id);
    return match?.name ?? null;
  }, [isDirect, rawOrder.vehicle_model_id, vehicleModels]);
  const bookedModelId = isDirect ? (rawOrder.vehicle_model_id ?? null) : null;
  const modelNameFor = (modelId: string | null | undefined) =>
    vehicleModels?.find((m) => m.id === modelId)?.name ?? modelId ?? 'no model';

  const processMutation = useProcessRawOrder();
  const collectMutation = useCollectPayment();
  const routing = usePaymentRouting();

  useEffect(() => {
    if (!open) return;
    setStep('review');
    setCustomer(billing);
    setSelectedAddons([]);
    setSecurityDeposit('');
    setSuccessMessage('');
    setPaymentMethodId('');
    setDepositMethodId('');
    setPaymentAccountId('');
    setDepositLiabilityAccountId('');
    setWaiveCardFee(false);
    setCollectPaymentNote('');
    setSettlementRef('');
    setWaiveDeposit(false);
    setPreActivationMethodId('');
    setPreActivationRef('');
    setPreActivationAmount('');
    setCollectNowAmount('');
    setDropoffLocationNote('');

    let pickup = '';
    let dropoff = '';
    let pickupLocName = '';
    let dropoffLocName = '';
    let locPickupFee = 0;
    let locDropoffFee = 0;

    if (isDirect) {
      pickup = toDatetimeLocal(rawOrder.pickup_datetime);
      dropoff = toDatetimeLocal(rawOrder.dropoff_datetime);
      setPayloadPickupLoc('');
      setPayloadDropoffLoc('');
      if (locations && locations.length > 0) {
        const pLoc = locations.find((l) => Number(l.id) === rawOrder.pickup_location_id);
        const dLoc = locations.find((l) => Number(l.id) === rawOrder.dropoff_location_id);
        pickupLocName = pLoc ? String(pLoc.name) : '';
        dropoffLocName = dLoc ? String(dLoc.name) : '';
        locPickupFee = effectiveLocationFee(pLoc, 'pickup');
        locDropoffFee = effectiveLocationFee(dLoc, 'dropoff');

        pickupLocName = partnerEstablishmentLocation(
          partnerBenefit,
          locationId(pLoc),
          rawOrder.vehicle_model_id,
        ) || pickupLocName;
        dropoffLocName = partnerEstablishmentLocation(
          partnerBenefit,
          locationId(dLoc),
          rawOrder.vehicle_model_id,
        ) || dropoffLocName;
      }
    } else {
      const extracted = rawOrder.payload
        ? extractPickupDropoffFromPayload(rawOrder.payload)
        : { pickup: '', dropoff: '' };
      pickup = extracted.pickup;
      dropoff = extracted.dropoff;

      const rawPickupLoc = rawOrder.payload ? extractPickupLocation(rawOrder.payload) : null;
      const rawDropoffLoc = rawOrder.payload ? extractDropoffLocation(rawOrder.payload) : null;
      setPayloadPickupLoc(rawPickupLoc ? normalizeLocationName(rawPickupLoc) : '');
      setPayloadDropoffLoc(rawDropoffLoc ? normalizeLocationName(rawDropoffLoc) : '');

      const matchLocation = (raw: string | null): string => {
        if (!raw || !locations || locations.length === 0) return '';
        const normalized = normalizeLocationName(raw).toLowerCase();
        const exact = locations.find((l) => String(l.name ?? '').toLowerCase() === normalized);
        if (exact) return String(exact.name);
        const partial = locations.find((l) => normalized.includes(String(l.name ?? '').toLowerCase()) || String(l.name ?? '').toLowerCase().includes(normalized));
        return partial ? String(partial.name) : '';
      };

      pickupLocName = matchLocation(rawPickupLoc);
      dropoffLocName = matchLocation(rawDropoffLoc);
      locPickupFee = pickupLocName && locations
        ? effectiveLocationFee(locations.find((l) => String(l.name) === pickupLocName), 'pickup')
        : 0;
      locDropoffFee = dropoffLocName && locations
        ? effectiveLocationFee(locations.find((l) => String(l.name) === dropoffLocName), 'dropoff')
        : 0;

      const matchedPickup = locations?.find((l) => String(l.name) === pickupLocName);
      const matchedDropoff = locations?.find((l) => String(l.name) === dropoffLocName);
      pickupLocName = partnerEstablishmentLocation(
        partnerBenefit,
        locationId(matchedPickup),
        rawOrder.vehicle_model_id,
      ) || pickupLocName;
      dropoffLocName = partnerEstablishmentLocation(
        partnerBenefit,
        locationId(matchedDropoff),
        rawOrder.vehicle_model_id,
      ) || dropoffLocName;
    }

    const days = calcDays(pickup, dropoff);

    setVehicles([{
      ...emptyVehicleRow(),
      pickupDatetime: pickup,
      dropoffDatetime: dropoff,
      rentalDaysCount: days || 1,
      pickupLocation: pickupLocName,
      dropoffLocation: dropoffLocName,
      pickupFee: locPickupFee,
      dropoffFee: locDropoffFee,
    }]);
  }, [open, rawOrder?.id, locations, partnerBenefit]);

  const vehicleAvailability = useQueries({
    queries: vehicles.map((vehicle) => {
      const options = availableVehiclesQuery(storeId, bookingDatetimeISO(vehicle.pickupDatetime), bookingDatetimeISO(vehicle.dropoffDatetime), rawOrder.partner_ref ?? undefined, rawOrder.id);
      return { ...options, enabled: open && options.enabled };
    }),
  });

  useEffect(() => {
    const invalid = vehicles.some((vehicle, index) => vehicle.vehicleId
      && vehicleAvailability[index]?.isSuccess && !vehicleAvailability[index].isFetching
      && !vehicleAvailability[index].data?.some((candidate) => candidate.id === vehicle.vehicleId));
    if (!invalid) return;
    setVehicles((current) => current.map((vehicle, index) => {
      const result = vehicleAvailability[index];
      return vehicle.vehicleId && result?.isSuccess && !result.isFetching
        && !result.data?.some((candidate) => candidate.id === vehicle.vehicleId)
        ? { ...vehicle, vehicleId: '', vehicleName: '' } : vehicle;
    }));
  }, [vehicleAvailability, vehicles]);

  const storeAccounts = useMemo(
    () => (accounts ?? []).filter((a) => {
      const sid = String(a.storeId ?? a.store_id ?? '');
      return sid === storeId || sid === 'company';
    }),
    [accounts, storeId],
  );

  const receivableAccount = useMemo(
    () => {
      const match = storeAccounts.find((a) => {
        const type = String(a.accountType ?? a.type ?? '').toLowerCase();
        const name = String(a.name ?? '').toLowerCase();
        return type === 'asset' && name.includes('receivable');
      });
      return match ?? storeAccounts.find((a) => String(a.accountType ?? a.type ?? '').toLowerCase() === 'asset');
    },
    [storeAccounts],
  );
  const incomeAccount = useMemo(
    () => {
      const match = storeAccounts.find((a) => {
        const type = String(a.accountType ?? a.type ?? '').toLowerCase();
        const name = String(a.name ?? '').toLowerCase();
        return (type === 'income' || type === 'revenue') && name.includes('rental');
      });
      return match ?? storeAccounts.find((a) => {
        const type = String(a.accountType ?? a.type ?? '').toLowerCase();
        return type === 'income' || type === 'revenue';
      });
    },
    [storeAccounts],
  );

  const paymentAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    return storeAccounts.filter((a) => {
      const id = String(a.id);
      if (seen.has(id)) return false;
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      const match = type === 'asset' && (name.includes('cash') || name.includes('bank') || name.includes('gcash'));
      if (match) seen.add(id);
      return match;
    });
  }, [storeAccounts]);

  const depositLiabilityAccountOptions = useMemo(() => {
    const seen = new Set<string>();
    return storeAccounts.filter((a) => {
      const id = String(a.id);
      if (seen.has(id)) return false;
      const type = String(a.accountType ?? a.type ?? '').toLowerCase();
      const name = String(a.name ?? '').toLowerCase();
      const match = type === 'liability' && name.includes('deposit');
      if (match) seen.add(id);
      return match;
    });
  }, [storeAccounts]);

  useEffect(() => {
    if (paymentAccountOptions.length === 1 && !paymentAccountId) {
      setPaymentAccountId(String(paymentAccountOptions[0].id));
    }
  }, [paymentAccountOptions, paymentAccountId]);

  useEffect(() => {
    if (depositLiabilityAccountOptions.length === 1 && !depositLiabilityAccountId) {
      setDepositLiabilityAccountId(String(depositLiabilityAccountOptions[0].id));
    }
  }, [depositLiabilityAccountOptions, depositLiabilityAccountId]);

  const routedPaymentAcct = routing.getReceivedInto(storeId, paymentMethodId);
  const routedDepositLiability = routing.resolveDepositLiability(
    storeAccounts as Array<{ id: string; name: string; accountType?: string; account_type?: string; storeId?: string | null; store_id?: string | null }>,
    storeId,
  );

  // The payment account follows the payment method. It used to be filled only
  // when empty, so a leftover selection (e.g. GCash) stayed in place after the
  // method changed to Cash and the payment was booked to the wrong account.
  useEffect(() => {
    setPaymentAccountId(routedPaymentAcct ?? '');
  }, [paymentMethodId, routedPaymentAcct]);

  useEffect(() => {
    if (routedDepositLiability && !depositLiabilityAccountId) setDepositLiabilityAccountId(routedDepositLiability);
  }, [routedDepositLiability, depositLiabilityAccountId]);

  const activePaymentMethods = useMemo(
    () => (paymentMethods ?? []).filter((m) => m.isActive !== false && m.is_active !== false),
    [paymentMethods],
  );
  const depositEligibleMethods = useMemo(
    () => activePaymentMethods.filter((m) => m.isDepositEligible !== false && m.is_deposit_eligible !== false),
    [activePaymentMethods],
  );

  const selectedPaymentMethod = useMemo(
    () => activePaymentMethods.find((m) => m.id === paymentMethodId),
    [activePaymentMethods, paymentMethodId],
  );
  const surchargePercent = selectedPaymentMethod
    ? Number(selectedPaymentMethod.surchargePercent ?? selectedPaymentMethod.surcharge_percent ?? 0)
    : 0;

  const rentalSubtotal = vehicles.reduce((sum, v) => {
    const days = v.rentalDaysCount || 1;
    return sum + v.rentalRate * days + v.pickupFee + v.dropoffFee - v.discount;
  }, 0);

  const addonSubtotal = selectedAddons
    .filter((a) => a.enabled)
    .reduce((sum, a) => sum + a.totalAmount, 0);

  const subtotalBeforeSurcharge = rentalSubtotal + addonSubtotal;
  const cardSurchargeAmount = (!waiveCardFee && surchargePercent > 0)
    ? Math.round(subtotalBeforeSurcharge * surchargePercent) / 100
    : 0;

  // Transfer fee is billable when the customer has NOT agreed to pay the driver directly.
  const transferBillable =
    isDirect && !transferPaidByCustomer
      ? Number(
          rawOrder.transfer_amount ??
          (rawOrder.payload as Record<string, unknown> | null)?.transfer_amount ??
          0,
        )
      : 0;

  const charityAmount = Number(rawOrder.charity_donation ?? 0);

  // Card surcharge applies to rental+addons only, not to transfer or charity.
  const finalTotal = subtotalBeforeSurcharge + cardSurchargeAmount + transferBillable + charityAmount;

  // Partial-payment support: how much to collect at activation (defaults to full total).
  const effectiveCollectNow = collectNowAmount === '' ? finalTotal : Number(collectNowAmount);
  const previewBalanceDue = paymentMethodId ? Math.max(0, finalTotal - effectiveCollectNow) : finalTotal;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canGoNext = stepIndex < STEPS.length - 1;
  const canGoBack = stepIndex > 0;

  const assignmentConflict = vehicles.some((vehicle, index) => {
    const result = vehicleAvailability[index];
    return !vehicle.vehicleId || result?.isFetching || !result?.isSuccess
      || !result.data?.some((candidate) => candidate.id === vehicle.vehicleId)
      || vehicles.slice(0, index).some((other) => other.vehicleId === vehicle.vehicleId);
  });

  const rackRequested = selectedAddons
    .filter((a) => a.enabled && isSurfRackAddon({ name: a.addonName }))
    .reduce((s, a) => s + (a.addonType === 'one_time' ? Math.max(1, a.quantity) : 1), 0);
  const rackWindow = useMemo(() => {
    const starts = vehicles.map((v) => new Date(bookingDatetimeISO(v.pickupDatetime)).getTime()).filter(Number.isFinite);
    const ends = vehicles.map((v) => new Date(bookingDatetimeISO(v.dropoffDatetime)).getTime()).filter(Number.isFinite);
    if (starts.length === 0 || ends.length === 0) return null;
    return { pickup: new Date(Math.min(...starts)).toISOString(), dropoff: new Date(Math.max(...ends)).toISOString() };
  }, [vehicles]);
  const hasRackAddon = (storeAddons ?? []).some((a) => isSurfRackAddon({
    name: String(a.name ?? ''), inventoryType: (a.inventoryType as string | null | undefined) ?? null,
  }));
  const { data: rackAvailability, isFetching: rackLoading } = useSurfRackAvailability(
    {
      storeId,
      pickupDatetime: rackWindow?.pickup ?? '',
      dropoffDatetime: rackWindow?.dropoff ?? '',
      excludeRawOrderId: rawOrder.id,
    },
    open && hasRackAddon && !!rackWindow,
  );
  const rackShort = surfRackShortfall(rackAvailability, rackRequested);
  const assignedVehicleHasMount = (() => {
    const assigned = vehicles
      .map((v, i) => vehicleAvailability[i]?.data?.find((c) => c.id === v.vehicleId))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (assigned.length === 0) return null;
    return assigned.some((c) => c.surfRack);
  })();

  const nextBlocker = (() => {
    if (step === 'review') {
      if (!customer.name.trim()) return 'Enter the customer name to continue.';
      if (whatsAppNumberError(customer.phone, false)) return 'Fix the WhatsApp number before continuing.';
    }
    if (step === 'vehicles') {
      if (vehicles.every((v) => !v.vehicleId)) return 'Choose a vehicle to continue.';
      if (vehicleAvailability.some((r) => r?.isFetching)) return 'Checking vehicle availability...';
      if (assignmentConflict) return 'Choose an available vehicle for every rental.';
    }
    return null;
  })();

  function goNext() {
    if (nextBlocker) return;
    if (canGoNext) setStep(STEPS[stepIndex + 1].key);
  }
  function goBack() {
    if (canGoBack) setStep(STEPS[stepIndex - 1].key);
  }

  function initAddons() {
    if (selectedAddons.length > 0) return;
    const totalDays = vehicles.reduce((max, v) => Math.max(max, v.rentalDaysCount || 1), 1);
    const directAddonIds = isDirect ? new Set(rawOrder.addon_ids ?? []) : null;
    const payloadAddonNames = isDirect ? new Set<string>() : extractPayloadAddonNames(payload);
    setSelectedAddons(
      (storeAddons ?? []).map((a) => {
        const adType = (a.addonType ?? a.type ?? 'one_time') as string;
        const price = adType === 'per_day' ? Number(a.pricePerDay ?? a.price ?? 0) : Number(a.priceOneTime ?? a.price ?? 0);
        const addonNameLower = (a.name as string).trim().toLowerCase();
        const preSelected = directAddonIds
          ? directAddonIds.has(Number(a.id))
          : payloadAddonNames.has(addonNameLower);
        return {
          addonName: a.name as string,
          addonPrice: price,
          addonType: adType as 'per_day' | 'one_time',
          quantity: adType === 'per_day' ? totalDays : 1,
          totalAmount: adType === 'per_day' ? price * totalDays : price,
          mutualExclusivityGroup: (a.mutualExclusivityGroup as string) ?? null,
          enabled: preSelected,
        };
      }),
    );
  }

  useEffect(() => {
    if (step === 'vehicles' && storeAddons) initAddons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, storeAddons]);

  const addonDays = vehicles.reduce((max, v) => Math.max(max, v.rentalDaysCount || 1), 1);
  useEffect(() => {
    setSelectedAddons((prev) => {
      if (!prev.some((a) => a.addonType === 'per_day' && a.quantity !== addonDays)) return prev;
      return prev.map((a) => (a.addonType === 'per_day'
        ? { ...a, quantity: addonDays, totalAmount: a.addonPrice * addonDays }
        : a));
    });
  }, [addonDays]);

  function toggleAddon(index: number) {
    setSelectedAddons((prev) => {
      const updated = [...prev];
      const target = updated[index];
      const nowEnabled = !target.enabled;

      if (nowEnabled && target.mutualExclusivityGroup) {
        for (let i = 0; i < updated.length; i++) {
          if (i !== index && updated[i].mutualExclusivityGroup === target.mutualExclusivityGroup) {
            updated[i] = { ...updated[i], enabled: false };
          }
        }
      }

      updated[index] = { ...target, enabled: nowEnabled };
      return updated;
    });
  }

  function updateVehicle(index: number, patch: Partial<VehicleRow>) {
    setVehicles((prev) => {
      const updated = [...prev];
      const merged = { ...updated[index], ...patch };

      if (patch.pickupDatetime !== undefined || patch.dropoffDatetime !== undefined) {
        merged.rentalDaysCount = calcDays(merged.pickupDatetime, merged.dropoffDatetime);
      }

      let modelId: string | null | undefined = null;
      if (patch.vehicleId && fleet) {
        const vehicle = fleet.find((v) => v.id === patch.vehicleId);
        if (vehicle) {
          merged.vehicleName = String(vehicle.vehicle_name ?? vehicle.name ?? vehicle.vehicleName ?? '');
          modelId = vehicle.modelId as string | null;
        }
      }

      // Auto-fill rate from pricing tiers when vehicle or dates change, unless the user has already set a manual rate.
      // A booking made for a specific model is priced at that model even if a different vehicle is handed over.
      if (!patch.rentalRate) {
        const mid = bookedModelId
          ?? modelId
          ?? (fleet?.find((v) => v.id === merged.vehicleId)?.modelId as string | null);
        const rate = findRate(mid, merged.rentalDaysCount, storePricing ?? []);
        if (rate !== null) merged.rentalRate = rate;
      }

      if (patch.pickupLocation && locations) {
        if (patch.pickupLocation === partnerPickupLocationOption) merged.pickupFee = 0;
        const loc = locations.find((l) => l.name === patch.pickupLocation || l.id === patch.pickupLocation);
        if (loc) merged.pickupFee = effectiveLocationFee(loc, 'pickup');
      }
      if (patch.dropoffLocation && locations) {
        if (patch.dropoffLocation === partnerDropoffLocationOption) merged.dropoffFee = 0;
        const loc = locations.find((l) => l.name === patch.dropoffLocation || l.id === patch.dropoffLocation);
        if (loc) merged.dropoffFee = effectiveLocationFee(loc, 'dropoff');
      }

      updated[index] = merged;
      return updated;
    });
  }

  function removeVehicleRow(index: number) {
    setVehicles((prev) => prev.length > 1 ? prev.filter((_, i) => i !== index) : prev);
  }

  function buildPayload(): ProcessRawOrderPayload & { id: string } {
    return {
      id: rawOrder.id,
      storeId,
      customer: {
        name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
      },
      vehicleAssignments: vehicles
        .filter((v) => v.vehicleId)
        .map((v) => ({
          vehicleId: v.vehicleId,
          vehicleName: v.vehicleName,
          pickupDatetime: bookingDatetimeISO(v.pickupDatetime),
          dropoffDatetime: bookingDatetimeISO(v.dropoffDatetime),
          rentalDaysCount: v.rentalDaysCount,
          pickupLocation: v.pickupLocation,
          dropoffLocation: v.dropoffLocation,
          pickupFee: v.pickupFee,
          dropoffFee: v.dropoffFee,
          rentalRate: v.rentalRate,
          helmetNumbers: v.helmetNumbers || null,
          discount: v.discount,
          opsNotes: v.opsNotes || null,
          isExtension: v.isExtension,
        })),
      addons: selectedAddons
        .filter((a) => a.enabled)
        .map((a) => ({
          addonName: a.addonName,
          addonPrice: a.addonPrice,
          addonType: a.addonType,
          quantity: a.quantity,
          totalAmount: a.totalAmount,
          mutualExclusivityGroup: a.mutualExclusivityGroup,
        })),
      securityDeposit: Number(securityDeposit) || 0,
      webQuoteRaw: webQuote || null,
      webNotes: isDirect
        ? (() => {
            const parts: string[] = [];
            if (rawOrder.customer_company?.trim()) parts.push(`Company: ${rawOrder.customer_company.trim()}`);
            if (rawOrder.customer_extra_comments?.trim()) parts.push(rawOrder.customer_extra_comments.trim());
            return parts.length > 0 ? parts.join('\n\n') : null;
          })()
        : ((payload.customer_note as string) ?? null),
      receivableAccountId: (receivableAccount?.id as string) ?? '',
      incomeAccountId: (incomeAccount?.id as string) ?? '',
      paymentMethodId: paymentMethodId || null,
      depositMethodId: depositMethodId || null,
      cardFeeSurcharge: cardSurchargeAmount,
      paymentAccountId: surchargePercent > 0 ? null : (paymentAccountId || null),
      depositLiabilityAccountId: depositLiabilityAccountId || null,
      isCardPayment: surchargePercent > 0,
      settlementRef: surchargePercent > 0 ? (settlementRef || null) : null,
      excludeTransferFromBalance: transferPaidByCustomer,
      transferAccommodation: transferAccommodation.trim() || null,
      dropoffLocationNote: dropoffLocationNote.trim() || null,
      partialPaymentAmount: (paymentMethodId && effectiveCollectNow < finalTotal) ? effectiveCollectNow : undefined,
    };
  }

  const depositValid = waiveDeposit || (Number(securityDeposit) > 0);

  const transferAmountMissing =
    !!rawOrder.transfer_type &&
    rawOrder.transfer_type !== '' &&
    !transferPaidByCustomer &&
    (!rawOrder.transfer_amount || rawOrder.transfer_amount === 0);

  async function handleActivate() {
    if (!canEditOrders) return;
    if (!depositValid) return;
    if (assignmentConflict) return;
    processMutation.mutate(buildPayload(), {
      onSuccess: () => {
        setSuccessMessage('Order activated successfully!');
        setTimeout(() => {
          setSuccessMessage('');
          onClose();
        }, 1500);
      },
    });
  }

  async function handleCollectPayment() {
    if (!canEditOrders) return;
    if (!paymentMethodId) return;
    collectMutation.mutate(
      {
        id: rawOrder.id,
        amount: finalTotal,
        paymentMethodId,
        note: collectPaymentNote || undefined,
        isCardPayment: surchargePercent > 0,
        settlementRef: surchargePercent > 0 ? (settlementRef || null) : null,
        customerName: customer.name || null,
      },
      {
        onSuccess: () => {
          setSuccessMessage('Payment collected. Order remains in inbox for activation.');
          setTimeout(() => setSuccessMessage(''), 3000);
        },
      },
    );
  }

  const preActivationMethod = useMemo(
    () => activePaymentMethods.find((m) => m.id === preActivationMethodId),
    [activePaymentMethods, preActivationMethodId],
  );
  const preActivationIsCard = preActivationMethod
    ? Number(preActivationMethod.surchargePercent ?? preActivationMethod.surcharge_percent ?? 0) > 0
    : false;

  async function handlePreActivationPayment() {
    if (!preActivationMethodId || !preActivationAmount) return;
    collectMutation.mutate(
      {
        id: rawOrder.id,
        amount: Number(preActivationAmount),
        paymentMethodId: preActivationMethodId,
        isCardPayment: preActivationIsCard,
        settlementRef: preActivationIsCard ? (preActivationRef || null) : null,
        customerName: customer.name || null,
      },
      {
        onSuccess: () => {
          setSuccessMessage('Pre-activation payment recorded successfully.');
          setPreActivationAmount('');
          setPreActivationRef('');
          setTimeout(() => setSuccessMessage(''), 3000);
        },
      },
    );
  }

  const partnerName = partnerBenefit?.name?.trim() || null;
  const transferAmount = isDirect
    ? Number(rawOrder.transfer_amount ?? (rawOrder.payload as Record<string, unknown> | null)?.transfer_amount ?? 0)
    : 0;
  const customerNotes = isDirect
    ? (rawOrder.customer_extra_comments?.trim() || null)
    : (payload.customer_note ? String(payload.customer_note) : null);
  const needsMeetingPoint = vehicles.some((v) => {
    if (!v.dropoffLocation) return false;
    const loc = locations?.find((l) => String(l.name) === v.dropoffLocation);
    return loc ? !isStoreLocation(loc) : true;
  });
  const paymentOrDeposit = Boolean(paymentMethodId) || Number(securityDeposit) > 0;

  const activationBlocker = !canEditOrders
    ? 'You can review this order, but activating or collecting payment requires order edit permission.'
    : assignmentConflict
      ? 'Choose an available vehicle for every rental.'
      : rackShort
        ? 'Not enough surf racks free for these dates — untick the surf rack add-on.'
        : transferAmountMissing
          ? 'Transfer amount is missing — set it before activating.'
          : !depositValid
            ? 'Enter a security deposit or tick Waive deposit.'
            : null;
  const footerNotice = step === 'summary' ? activationBlocker : nextBlocker;

  const channelLabel = !isDirect ? 'WooCommerce' : rawOrder.booking_channel === 'walk_in' ? 'Walk-in' : 'Direct';
  const title = (
    <span className="inline-flex max-w-full items-center">
      <span className="min-w-0 truncate">{customer.name.trim() || 'Process order'}</span>
      {waiverRef && <OrderRefChip value={waiverRef} />}
      <span className="ml-2 hidden items-center gap-1 sm:inline-flex">
        <Badge color={rawOrder.source === 'lolas' ? 'blue' : 'purple'}>
          {rawOrder.source === 'lolas' ? "Lola's Rentals" : 'Bass Bikes'}
        </Badge>
        <Badge color={isDirect ? 'green' : 'gray'}>{channelLabel}</Badge>
      </span>
    </span>
  );

  const secondaryButton = 'rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:py-2';
  const footer = (
    <div>
      {footerNotice && <p className="mb-2 text-sm font-medium text-amber-700" role="status">{footerNotice}</p>}
      <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex sm:items-center sm:justify-end sm:gap-3">
        <button type="button" onClick={canGoBack ? goBack : onClose} className={`${secondaryButton} sm:mr-auto`}>
          {canGoBack ? 'Back' : 'Cancel'}
        </button>

        {step === 'summary' ? (
          canEditOrders && (
            <>
              <button
                type="button"
                onClick={handleCollectPayment}
                disabled={collectMutation.isPending || !paymentMethodId}
                className="order-first col-span-2 rounded-lg border border-blue-600 px-5 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50 sm:order-none sm:col-span-1 sm:py-2"
                title={paymentMethodId ? 'Record payment without activating the order' : 'Choose a payment method first'}
              >
                {collectMutation.isPending ? 'Collecting...' : 'Collect payment only'}
              </button>
              <button
                type="button"
                onClick={handleActivate}
                disabled={processMutation.isPending || Boolean(activationBlocker)}
                className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 sm:py-2"
              >
                {processMutation.isPending ? 'Activating...' : 'Activate order'}
              </button>
            </>
          )
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={Boolean(nextBlocker)}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:py-2"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
    <Modal open={open} onClose={onClose} title={title} size="2xl" footer={footer} fullScreenOnMobile>
      <BookingStepper steps={STEPS} currentIndex={stepIndex} onSelect={(i) => setStep(STEPS[i].key)} />

      {successMessage && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-center font-medium text-green-700">
          {successMessage}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-5">
        <aside className="min-w-0 lg:sticky lg:top-0 lg:order-2">
          <BookingSidePanel
            rawOrder={rawOrder}
            isDirect={isDirect}
            bookedModelName={directModelName ?? (rawOrder.vehicle_model_id && isDirect ? rawOrder.vehicle_model_id : null)}
            requestedAddonNames={requestedAddonNames}
            lineItems={lineItems}
            wcOrderNumber={isDirect ? null : String(payload.number ?? payload.id ?? '—')}
            customerNotes={customerNotes}
            partnerName={partnerName}
            vehicles={vehicles}
            enabledAddons={selectedAddons.filter((a) => a.enabled)}
            transferAmount={transferAmount}
            transferPaidByCustomer={transferPaidByCustomer}
            cardSurchargeAmount={cardSurchargeAmount}
            surchargePercent={surchargePercent}
            charityAmount={charityAmount}
            finalTotal={finalTotal}
            webQuote={webQuote}
            waiverUrl={waiverUrl}
            invoiceReference={rawOrder.order_reference ?? rawOrder.id}
          />
        </aside>

        <div className="min-w-0 lg:order-1">
          {step === 'review' && (
            <CustomerStep
              customer={customer}
              onCustomerChange={(patch) => setCustomer((c) => ({ ...c, ...patch }))}
              hasTransfer={isDirect && Boolean(rawOrder.transfer_type)}
              transferAccommodation={transferAccommodation}
              onTransferAccommodationChange={setTransferAccommodation}
              transferPaidByCustomer={transferPaidByCustomer}
              onTransferPaidByCustomerChange={setTransferPaidByCustomer}
              paymentMethods={activePaymentMethods}
              preActivationMethodId={preActivationMethodId}
              onPreActivationMethodChange={setPreActivationMethodId}
              preActivationAmount={preActivationAmount}
              onPreActivationAmountChange={setPreActivationAmount}
              preActivationRef={preActivationRef}
              onPreActivationRefChange={setPreActivationRef}
              preActivationIsCard={preActivationIsCard}
              onRecordPreActivation={handlePreActivationPayment}
              recording={collectMutation.isPending}
              error={collectMutation.error ? (collectMutation.error as Error).message : null}
            />
          )}

          {step === 'vehicles' && (
            <VehicleStep
              storeId={storeId}
              vehicles={vehicles}
              availability={vehicleAvailability}
              fleet={fleet}
              bookedModelId={bookedModelId}
              modelNameFor={modelNameFor}
              onUpdateVehicle={updateVehicle}
              onRemoveVehicle={removeVehicleRow}
              onOpenInspection={() => setInspectionOpen(true)}
              locations={locations}
              locationOptionLabel={locationOptionLabel}
              partnerName={partnerName}
              partnerLocationOption={{ pickup: partnerPickupLocationOption, dropoff: partnerDropoffLocationOption }}
              websiteLocation={{ pickup: payloadPickupLoc, dropoff: payloadDropoffLoc }}
              addons={selectedAddons}
              addonsLoaded={storeAddons !== undefined}
              onToggleAddon={toggleAddon}
              rackAvailability={rackAvailability}
              rackLoading={rackLoading}
              rackRequested={rackRequested}
              assignedVehicleHasMount={assignedVehicleHasMount}
              onWalkInBooking={onWalkInBooking ? () => { onClose(); onWalkInBooking(); } : undefined}
            />
          )}

          {step === 'summary' && (
            <PaymentStep
              customerChoseMethod={rawOrder.web_payment_method ?? null}
              paymentMethods={activePaymentMethods}
              depositMethods={depositEligibleMethods}
              paymentMethodId={paymentMethodId}
              onPaymentMethodChange={(value) => { setPaymentMethodId(value); setWaiveCardFee(false); }}
              surchargePercent={surchargePercent}
              cardSurchargeAmount={cardSurchargeAmount}
              waiveCardFee={waiveCardFee}
              onWaiveCardFeeChange={setWaiveCardFee}
              finalTotal={finalTotal}
              collectNowAmount={collectNowAmount}
              onCollectNowAmountChange={setCollectNowAmount}
              previewBalanceDue={previewBalanceDue}
              settlementRef={settlementRef}
              onSettlementRefChange={setSettlementRef}
              showPaymentAccount={paymentOrDeposit && !(surchargePercent > 0) && !routedPaymentAcct}
              paymentAccountId={paymentAccountId}
              onPaymentAccountChange={setPaymentAccountId}
              paymentAccountOptions={paymentAccountOptions}
              securityDeposit={securityDeposit}
              onSecurityDepositChange={setSecurityDeposit}
              waiveDeposit={waiveDeposit}
              onWaiveDepositChange={(checked) => {
                setWaiveDeposit(checked);
                if (checked) setSecurityDeposit(0);
              }}
              depositMethodId={depositMethodId}
              onDepositMethodChange={setDepositMethodId}
              showDepositLiability={paymentOrDeposit && !routedDepositLiability}
              depositLiabilityAccountId={depositLiabilityAccountId}
              onDepositLiabilityAccountChange={setDepositLiabilityAccountId}
              depositLiabilityAccountOptions={depositLiabilityAccountOptions}
              needsMeetingPoint={needsMeetingPoint}
              dropoffLocationNote={dropoffLocationNote}
              onDropoffLocationNoteChange={setDropoffLocationNote}
              missingChartOfAccounts={!receivableAccount && !incomeAccount}
              error={(processMutation.error ?? collectMutation.error) ? ((processMutation.error ?? collectMutation.error) as Error).message : null}
            />
          )}
        </div>
      </div>
    </Modal>

    {inspectionOpen && createPortal(
      <InspectionModal
        open={inspectionOpen}
        onClose={() => setInspectionOpen(false)}
        orderId={rawOrder.id}
        orderReference={waiverRef ?? rawOrder.id}
        storeId={storeId}
        employeeName={employeeName}
        onComplete={() => setInspectionOpen(false)}
        onVehicleAssigned={(vehicleId, vehicleName) => {
          updateVehicle(0, { vehicleId, vehicleName });
        }}
      />,
      document.body,
    )}
    </>
  );
}
