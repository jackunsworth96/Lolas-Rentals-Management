import { useState, useMemo, useEffect } from 'react';
import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useFleet } from '../../api/fleet.js';
import {
  extractPickupDropoffFromPayload,
  extractPickupLocation,
  extractDropoffLocation,
  normalizeLocationName,
  toDatetimeLocal,
} from '../../utils/raw-order-payload.js';
import { useAddons, useLocations, useChartOfAccounts, useStorePricing, useFleetStatuses, usePaymentMethods, useVehicleModels } from '../../api/config.js';
import { useProcessRawOrder, useCollectPayment, type RawOrder, type ProcessRawOrderPayload } from '../../api/orders-raw.js';
import { formatCurrency } from '../../utils/currency.js';
import { usePaymentRouting } from '../../hooks/use-payment-routing.js';
import { resolveStoreFromSource } from '@lolas/shared';

// ── AM/PM datetime helpers ──

interface TimeParts { date: string; hours12: number; minutes: number; ampm: 'AM' | 'PM' }

function splitDatetime(dt: string): TimeParts {
  if (!dt) return { date: '', hours12: 12, minutes: 0, ampm: 'AM' };
  const [datePart, timePart] = dt.split('T');
  if (!timePart) return { date: datePart || '', hours12: 12, minutes: 0, ampm: 'AM' };
  const [hStr, mStr] = timePart.split(':');
  let h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h === 0) h = 12;
  else if (h > 12) h -= 12;
  return { date: datePart, hours12: h, minutes: m, ampm };
}

function combineFromParts(p: TimeParts): string {
  if (!p.date) return '';
  let h24 = p.hours12;
  if (p.ampm === 'AM' && h24 === 12) h24 = 0;
  else if (p.ampm === 'PM' && h24 < 12) h24 += 12;
  return `${p.date}T${String(h24).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}`;
}


interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  rawOrder: RawOrder;
}

type Step = 'review' | 'vehicles' | 'addons' | 'summary';
const STEPS: { key: Step; label: string }[] = [
  { key: 'review', label: 'Review' },
  { key: 'vehicles', label: 'Vehicles' },
  { key: 'addons', label: 'Add-ons' },
  { key: 'summary', label: 'Summary' },
];

interface CustomerData {
  name: string;
  email: string;
  phone: string;
}

interface VehicleRow {
  vehicleId: string;
  vehicleName: string;
  pickupDatetime: string;
  dropoffDatetime: string;
  rentalDaysCount: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupFee: number;
  dropoffFee: number;
  rentalRate: number;
  helmetNumbers: string;
  discount: number;
  opsNotes: string;
  isExtension: boolean;
}

interface AddonRow {
  addonName: string;
  addonPrice: number;
  addonType: 'per_day' | 'one_time';
  quantity: number;
  totalAmount: number;
  mutualExclusivityGroup: string | null;
  enabled: boolean;
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

export function BookingModal({ open, onClose, rawOrder }: BookingModalProps) {
  const storeId = storeIdFromSource(rawOrder.source);
  const isDirect = rawOrder.booking_channel === 'direct';
  const payload = rawOrder.payload ?? {};

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
    ? (Number(rawOrder.web_quote_raw ?? 0) || 0)
    : (Number(payload.total ?? payload.order_total ?? payload.web_quote_raw ?? 0) || 0);

  const [step, setStep] = useState<Step>('review');
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
  const [preActivationMethodId, setPreActivationMethodId] = useState('');
  const [preActivationRef, setPreActivationRef] = useState('');
  const [preActivationAmount, setPreActivationAmount] = useState<number | ''>('');

  const { data: vehicleModels } = useVehicleModels() as { data: Array<{ id: string; name: string }> | undefined };
  const { data: fleet } = useFleet(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const { data: storeAddons } = useAddons(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const { data: locations } = useLocations(storeId) as { data: Array<Record<string, unknown>> | undefined };
  const { data: accounts } = useChartOfAccounts() as { data: Array<Record<string, unknown>> | undefined };
  const { data: storePricing } = useStorePricing(storeId) as { data: PricingTier[] | undefined };
  const { data: fleetStatuses } = useFleetStatuses() as { data: Array<{ id: string; name: string; isRentable?: boolean; is_rentable?: boolean }> | undefined };
  const { data: paymentMethods } = usePaymentMethods() as { data: Array<{ id: string; name: string; surchargePercent?: number; surcharge_percent?: number; isActive?: boolean; is_active?: boolean; isDepositEligible?: boolean; is_deposit_eligible?: boolean }> | undefined };

  const directModelName = useMemo(() => {
    if (!isDirect || !rawOrder.vehicle_model_id || !vehicleModels) return null;
    const match = vehicleModels.find((m) => m.id === rawOrder.vehicle_model_id);
    return match?.name ?? null;
  }, [isDirect, rawOrder.vehicle_model_id, vehicleModels]);

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
        locPickupFee = pLoc ? Number(pLoc.deliveryCost ?? 0) : 0;
        locDropoffFee = dLoc ? Number(dLoc.collectionCost ?? 0) : 0;
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
        ? Number(locations.find((l) => String(l.name) === pickupLocName)?.deliveryCost ?? 0)
        : 0;
      locDropoffFee = dropoffLocName && locations
        ? Number(locations.find((l) => String(l.name) === dropoffLocName)?.collectionCost ?? 0)
        : 0;
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
  }, [open, rawOrder?.id, locations]);

  const rentableStatusSet = useMemo(() => {
    const statuses = fleetStatuses ?? [];
    if (statuses.length === 0) return new Set(['available', 'rentable']);
    const set = new Set<string>();
    for (const s of statuses) {
      const rentable = s.isRentable ?? s.is_rentable ?? false;
      if (rentable) {
        set.add(s.id.toLowerCase());
        set.add(s.name.toLowerCase());
      }
    }
    return set.size > 0 ? set : new Set(['available', 'rentable']);
  }, [fleetStatuses]);

  const filteredByStatus = useMemo(
    () => (fleet ?? []).filter((v) => rentableStatusSet.has(String(v.status ?? '').toLowerCase())),
    [fleet, rentableStatusSet],
  );
  const vehicleFilterFallback = filteredByStatus.length === 0 && (fleet ?? []).length > 0;
  const availableVehicles = vehicleFilterFallback ? (fleet ?? []) : filteredByStatus;

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

  useEffect(() => {
    if (routedPaymentAcct && !paymentAccountId) setPaymentAccountId(routedPaymentAcct);
  }, [routedPaymentAcct, paymentAccountId]);

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
  const finalTotal = subtotalBeforeSurcharge + cardSurchargeAmount;

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const canGoNext = stepIndex < STEPS.length - 1;
  const canGoBack = stepIndex > 0;

  function goNext() {
    if (step === 'review' && !customer.name.trim()) return;
    if (step === 'vehicles' && vehicles.every((v) => !v.vehicleId)) return;

    if (step === 'vehicles') {
      initAddons();
    }

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

      if (!merged.isExtension) {
        const mid = modelId ?? (fleet?.find((v) => v.id === merged.vehicleId)?.modelId as string | null);
        const rate = findRate(mid, merged.rentalDaysCount, storePricing ?? []);
        if (rate !== null) merged.rentalRate = rate;
      }

      if (patch.pickupLocation && locations) {
        const loc = locations.find((l) => l.name === patch.pickupLocation || l.id === patch.pickupLocation);
        if (loc) merged.pickupFee = Number(loc.deliveryCost ?? loc.fee ?? 0);
      }
      if (patch.dropoffLocation && locations) {
        const loc = locations.find((l) => l.name === patch.dropoffLocation || l.id === patch.dropoffLocation);
        if (loc) merged.dropoffFee = Number(loc.collectionCost ?? loc.fee ?? 0);
      }

      updated[index] = merged;
      return updated;
    });
  }

  function addVehicleRow() {
    setVehicles((prev) => [...prev, emptyVehicleRow()]);
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
          pickupDatetime: v.pickupDatetime,
          dropoffDatetime: v.dropoffDatetime,
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
      webNotes: isDirect ? null : ((payload.customer_note as string) ?? null),
      receivableAccountId: (receivableAccount?.id as string) ?? '',
      incomeAccountId: (incomeAccount?.id as string) ?? '',
      paymentMethodId: paymentMethodId || null,
      depositMethodId: depositMethodId || null,
      cardFeeSurcharge: cardSurchargeAmount,
      paymentAccountId: surchargePercent > 0 ? null : (paymentAccountId || null),
      depositLiabilityAccountId: depositLiabilityAccountId || null,
      isCardPayment: surchargePercent > 0,
      settlementRef: surchargePercent > 0 ? (settlementRef || null) : null,
    };
  }

  const depositValid = waiveDeposit || (Number(securityDeposit) > 0);

  async function handleActivate() {
    if (!depositValid) return;
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

  const stepTitle = `Process Order — ${STEPS[stepIndex].label} (${stepIndex + 1}/${STEPS.length})`;

  return (
    <Modal open={open} onClose={onClose} title={stepTitle} size="xl">
      <div className="min-h-[400px]">
        {/* Step indicator */}
        <div className="mb-6 flex gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (i < stepIndex) setStep(s.key);
                }}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i === stepIndex
                    ? 'bg-blue-600 text-white'
                    : i < stepIndex
                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                      : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i < stepIndex ? '✓' : i + 1}
              </button>
              <span className={`text-sm ${i === stepIndex ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className="mx-2 h-px w-8 bg-gray-200" />}
            </div>
          ))}
        </div>

        {successMessage && (
          <div className="mb-4 rounded-lg bg-green-50 p-4 text-center text-green-700 font-medium">
            {successMessage}
          </div>
        )}

        {/* Step 1: Review */}
        {step === 'review' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 font-medium text-gray-900">Customer Details</h3>
              <div className="grid grid-cols-3 gap-4">
                <label className="block">
                  <span className="text-sm text-gray-600">Name</span>
                  <input
                    type="text"
                    value={customer.name}
                    onChange={(e) => setCustomer((c) => ({ ...c, name: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Email</span>
                  <input
                    type="email"
                    value={customer.email}
                    onChange={(e) => setCustomer((c) => ({ ...c, email: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Phone</span>
                  <input
                    type="tel"
                    value={customer.phone}
                    onChange={(e) => setCustomer((c) => ({ ...c, phone: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <h3 className="mb-3 font-medium text-gray-900">Booking Info</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Store</dt>
                    <dd>
                      <Badge color={rawOrder.source === 'lolas' ? 'blue' : 'purple'}>
                        {rawOrder.source === 'lolas' ? "Lola's Rentals" : 'Bass Bikes'}
                      </Badge>
                    </dd>
                  </div>
                  {isDirect ? (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Order Ref</dt>
                        <dd className="font-medium">{rawOrder.order_reference ?? '—'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Channel</dt>
                        <dd><Badge color="green">Direct</Badge></dd>
                      </div>
                      {rawOrder.vehicle_model_id && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Vehicle Model</dt>
                          <dd className="font-medium">{directModelName ?? rawOrder.vehicle_model_id}</dd>
                        </div>
                      )}
                      {webQuote > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Web Quote</dt>
                          <dd className="font-medium">{formatCurrency(webQuote)}</dd>
                        </div>
                      )}
                      {rawOrder.transfer_type && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Transfer</dt>
                          <dd className="font-medium capitalize">{rawOrder.transfer_type}{rawOrder.transfer_route ? ` — ${rawOrder.transfer_route}` : ''}</dd>
                        </div>
                      )}
                      {rawOrder.flight_number && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Flight</dt>
                          <dd className="font-medium">{rawOrder.flight_number}</dd>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">WC Order #</dt>
                        <dd className="font-medium">{String(payload.number ?? payload.id ?? '—')}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Web Quote</dt>
                        <dd className="font-medium">{webQuote > 0 ? formatCurrency(webQuote) : '—'}</dd>
                      </div>
                      {payload.customer_note && (
                        <div>
                          <dt className="text-gray-500">Customer Notes</dt>
                          <dd className="mt-1 rounded bg-yellow-50 p-2 text-gray-700">{String(payload.customer_note)}</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                {isDirect ? (
                  <>
                    <h3 className="mb-3 font-medium text-gray-900">Direct Booking Summary</h3>
                    <dl className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Pickup</dt>
                        <dd className="font-medium">{rawOrder.pickup_datetime ? toDatetimeLocal(rawOrder.pickup_datetime).replace('T', ' ') : '—'}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-gray-500">Dropoff</dt>
                        <dd className="font-medium">{rawOrder.dropoff_datetime ? toDatetimeLocal(rawOrder.dropoff_datetime).replace('T', ' ') : '—'}</dd>
                      </div>
                      {rawOrder.addon_ids && rawOrder.addon_ids.length > 0 && (
                        <div className="flex justify-between">
                          <dt className="text-gray-500">Add-ons selected</dt>
                          <dd className="font-medium">{rawOrder.addon_ids.length}</dd>
                        </div>
                      )}
                    </dl>
                  </>
                ) : (
                  <>
                    <h3 className="mb-3 font-medium text-gray-900">WooCommerce Line Items</h3>
                    {lineItems.length === 0 ? (
                      <p className="text-sm text-gray-500">No line items</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {lineItems.map((item, i) => (
                          <li key={i} className="flex justify-between rounded bg-gray-50 px-3 py-2">
                            <span>{String(item.name ?? 'Item')} x{String(item.quantity ?? 1)}</span>
                            <span className="font-medium">{formatCurrency(Number(item.total ?? 0))}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Pre-activation card payment */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <h3 className="font-medium text-gray-900">Record Pre-activation Payment</h3>
                <Badge color="blue">Before vehicle assignment</Badge>
              </div>
              <p className="mb-3 text-xs text-gray-600">
                Record a card payment now if the customer is paying before vehicle collection. The order still needs to be processed through the remaining steps.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-sm text-gray-600">Payment Method</span>
                  <select
                    value={preActivationMethodId}
                    onChange={(e) => setPreActivationMethodId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select...</option>
                    {activePaymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Amount</span>
                  <input
                    type="number"
                    value={preActivationAmount}
                    onChange={(e) => setPreActivationAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0.00"
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                {preActivationIsCard && (
                  <label className="block">
                    <span className="text-sm text-gray-600">Card Reference #</span>
                    <input
                      type="text"
                      value={preActivationRef}
                      onChange={(e) => setPreActivationRef(e.target.value)}
                      placeholder="Terminal receipt #"
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                )}
              </div>
              {preActivationIsCard && (
                <p className="mt-2 text-xs text-amber-700">
                  Card payment — a pending settlement will be created for reconciliation.
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={handlePreActivationPayment}
                  disabled={collectMutation.isPending || !preActivationMethodId || !preActivationAmount}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {collectMutation.isPending ? 'Recording...' : 'Record Pre-activation Payment'}
                </button>
              </div>
              {collectMutation.error && step === 'review' && (
                <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
                  {(collectMutation.error as Error).message}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Vehicles */}
        {step === 'vehicles' && (
          <div className="space-y-4">
            {vehicleFilterFallback && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-800">
                Fleet status filter could not match any vehicles — showing all fleet vehicles.
                Check Settings &gt; Fleet Statuses to ensure status categories are configured correctly.
              </div>
            )}

            {vehicles.map((v, i) => {
              const pickupParts = splitDatetime(v.pickupDatetime);
              const dropoffParts = splitDatetime(v.dropoffDatetime);

              const updatePickupPart = (patch: Partial<TimeParts>) => {
                const merged = { ...pickupParts, ...patch };
                updateVehicle(i, { pickupDatetime: combineFromParts(merged) });
              };
              const updateDropoffPart = (patch: Partial<TimeParts>) => {
                const merged = { ...dropoffParts, ...patch };
                updateVehicle(i, { dropoffDatetime: combineFromParts(merged) });
              };

              return (
              <div key={i} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">Vehicle {i + 1}</h3>
                  {vehicles.length > 1 && (
                    <button onClick={() => removeVehicleRow(i)} className="text-sm text-red-500 hover:text-red-700">
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="block">
                    <span className="text-sm text-gray-600">Vehicle</span>
                    <select
                      value={v.vehicleId}
                      onChange={(e) => updateVehicle(i, { vehicleId: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select vehicle...</option>
                      {availableVehicles.map((fv) => (
                        <option key={String(fv.id)} value={String(fv.id)}>
                          {String(fv.name ?? fv.id)}
                        </option>
                      ))}
                    </select>
                    {v.vehicleId && !fleet?.find((fv) => fv.id === v.vehicleId)?.modelId && (
                      <p className="mt-1 text-xs text-amber-600">No model linked — set vehicle model in fleet settings to auto-fill rate.</p>
                    )}
                  </div>

                  <div className="block">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Rental Rate (per day)</span>
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={v.isExtension}
                          onChange={(e) => updateVehicle(i, { isExtension: e.target.checked })}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                        />
                        Extension (override rate)
                      </label>
                    </div>
                    <input
                      type="number"
                      value={v.rentalRate}
                      onChange={(e) => updateVehicle(i, { rentalRate: Number(e.target.value) })}
                      readOnly={!v.isExtension}
                      className={`mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                        !v.isExtension ? 'bg-gray-50 text-gray-600' : ''
                      }`}
                    />
                  </div>

                  {/* Pickup Date/Time — AM/PM */}
                  <div className="block">
                    <span className="text-sm text-gray-600">Pickup Date/Time</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="date"
                        value={pickupParts.date}
                        onChange={(e) => updatePickupPart({ date: e.target.value })}
                        className="block w-[130px] rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min={1} max={12}
                        value={pickupParts.hours12}
                        onChange={(e) => updatePickupPart({ hours12: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                        className="block w-[52px] rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 font-medium">:</span>
                      <input
                        type="number"
                        min={0} max={59}
                        value={String(pickupParts.minutes).padStart(2, '0')}
                        onChange={(e) => updatePickupPart({ minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                        className="block w-[52px] rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => updatePickupPart({ ampm: pickupParts.ampm === 'AM' ? 'PM' : 'AM' })}
                        className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {pickupParts.ampm}
                      </button>
                    </div>
                  </div>

                  {/* Dropoff Date/Time — AM/PM */}
                  <div className="block">
                    <span className="text-sm text-gray-600">Dropoff Date/Time</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dropoffParts.date}
                        onChange={(e) => updateDropoffPart({ date: e.target.value })}
                        className="block w-[130px] rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="number"
                        min={1} max={12}
                        value={dropoffParts.hours12}
                        onChange={(e) => updateDropoffPart({ hours12: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                        className="block w-[52px] rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <span className="text-gray-400 font-medium">:</span>
                      <input
                        type="number"
                        min={0} max={59}
                        value={String(dropoffParts.minutes).padStart(2, '0')}
                        onChange={(e) => updateDropoffPart({ minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
                        className="block w-[52px] rounded-lg border border-gray-300 px-2 py-2 text-sm text-center focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => updateDropoffPart({ ampm: dropoffParts.ampm === 'AM' ? 'PM' : 'AM' })}
                        className="rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {dropoffParts.ampm}
                      </button>
                    </div>
                  </div>

                  {/* Pickup Location */}
                  <div className="block">
                    <span className="text-sm text-gray-600">Pickup Location</span>
                    <select
                      value={v.pickupLocation}
                      onChange={(e) => updateVehicle(i, { pickupLocation: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select...</option>
                      {(locations ?? []).map((l) => (
                        <option key={String(l.id)} value={String(l.name)}>
                          {String(l.name)} {Number(l.deliveryCost ?? l.fee ?? 0) > 0 ? `(${formatCurrency(Number(l.deliveryCost ?? l.fee ?? 0))})` : ''}
                        </option>
                      ))}
                    </select>
                    {!v.pickupLocation && payloadPickupLoc && (
                      <p className="mt-1 text-xs text-amber-600">Website order: {payloadPickupLoc}</p>
                    )}
                  </div>

                  {/* Dropoff Location */}
                  <div className="block">
                    <span className="text-sm text-gray-600">Dropoff Location</span>
                    <select
                      value={v.dropoffLocation}
                      onChange={(e) => updateVehicle(i, { dropoffLocation: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select...</option>
                      {(locations ?? []).map((l) => (
                        <option key={String(l.id)} value={String(l.name)}>
                          {String(l.name)} {Number(l.deliveryCost ?? l.fee ?? 0) > 0 ? `(${formatCurrency(Number(l.deliveryCost ?? l.fee ?? 0))})` : ''}
                        </option>
                      ))}
                    </select>
                    {!v.dropoffLocation && payloadDropoffLoc && (
                      <p className="mt-1 text-xs text-amber-600">Website order: {payloadDropoffLoc}</p>
                    )}
                  </div>

                  <label className="block">
                    <span className="text-sm text-gray-600">Helmet Numbers</span>
                    <input
                      type="text"
                      value={v.helmetNumbers}
                      onChange={(e) => updateVehicle(i, { helmetNumbers: e.target.value })}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. H12, H13"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm text-gray-600">Discount</span>
                    <input
                      type="number"
                      value={v.discount}
                      onChange={(e) => updateVehicle(i, { discount: Number(e.target.value) })}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
                  <span>Days: <strong>{v.rentalDaysCount}</strong></span>
                  <span>Subtotal: <strong>{formatCurrency(v.rentalRate * v.rentalDaysCount + v.pickupFee + v.dropoffFee - v.discount)}</strong></span>
                </div>
              </div>
              );
            })}

            <button
              onClick={addVehicleRow}
              className="rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600"
            >
              + Add another vehicle
            </button>
          </div>
        )}

        {/* Step 3: Add-ons */}
        {step === 'addons' && (
          <div className="space-y-3">
            {selectedAddons.length === 0 ? (
              <p className="py-8 text-center text-gray-500">No add-ons configured for this store.</p>
            ) : (
              selectedAddons.map((addon, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-4 transition ${
                    addon.enabled ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={addon.enabled}
                      onChange={() => toggleAddon(i)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <div className="font-medium text-gray-900">{addon.addonName}</div>
                      <div className="text-sm text-gray-500">
                        {formatCurrency(addon.addonPrice)} {addon.addonType === 'per_day' ? '/ day' : '(one-time)'}
                        {addon.mutualExclusivityGroup && (
                          <Badge color="gray" className="ml-2">{addon.mutualExclusivityGroup}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    {addon.addonType === 'per_day' && (
                      <div className="text-xs text-gray-500">{addon.quantity} days</div>
                    )}
                    <div className="font-medium">{formatCurrency(addon.totalAmount)}</div>
                  </div>
                </label>
              ))
            )}
          </div>
        )}

        {/* Step 4: Summary */}
        {step === 'summary' && (
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-200 p-4">
              <h3 className="mb-3 font-medium text-gray-900">Pricing Breakdown</h3>
              <dl className="space-y-2 text-sm">
                {vehicles.filter((v) => v.vehicleId).map((v, i) => (
                  <div key={i} className="flex justify-between">
                    <dt className="text-gray-600">
                      {v.vehicleName || 'Vehicle'} ({v.rentalDaysCount}d x {formatCurrency(v.rentalRate)})
                    </dt>
                    <dd className="font-medium">
                      {formatCurrency(v.rentalRate * v.rentalDaysCount + v.pickupFee + v.dropoffFee - v.discount)}
                    </dd>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2">
                  <dt className="font-medium text-gray-700">Rental Subtotal</dt>
                  <dd className="font-medium">{formatCurrency(rentalSubtotal)}</dd>
                </div>

                {selectedAddons.filter((a) => a.enabled).map((a, i) => (
                  <div key={i} className="flex justify-between">
                    <dt className="text-gray-600">{a.addonName}</dt>
                    <dd>{formatCurrency(a.totalAmount)}</dd>
                  </div>
                ))}

                {addonSubtotal > 0 && (
                  <div className="flex justify-between border-t pt-2">
                    <dt className="font-medium text-gray-700">Add-on Subtotal</dt>
                    <dd className="font-medium">{formatCurrency(addonSubtotal)}</dd>
                  </div>
                )}

                {cardSurchargeAmount > 0 && (
                  <div className="flex justify-between text-amber-700">
                    <dt>Card surcharge ({surchargePercent}%)</dt>
                    <dd className="font-medium">{formatCurrency(cardSurchargeAmount)}</dd>
                  </div>
                )}

                <div className="flex justify-between border-t border-gray-900 pt-3 text-base">
                  <dt className="font-bold text-gray-900">Final Total</dt>
                  <dd className="font-bold text-gray-900">{formatCurrency(finalTotal)}</dd>
                </div>
              </dl>
            </div>

            {/* Payment Methods */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Rental Payment Method</span>
                  <select
                    value={paymentMethodId}
                    onChange={(e) => { setPaymentMethodId(e.target.value); setWaiveCardFee(false); }}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select payment method...</option>
                    {activePaymentMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
                {surchargePercent > 0 && !waiveCardFee && (
                  <p className="mt-2 text-xs text-amber-600">
                    {surchargePercent}% surcharge applies ({formatCurrency(cardSurchargeAmount)})
                  </p>
                )}
                {surchargePercent > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={waiveCardFee}
                      onChange={(e) => setWaiveCardFee(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Waive card fee
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">Deposit Payment Method</span>
                  <select
                    value={depositMethodId}
                    onChange={(e) => setDepositMethodId(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select deposit method...</option>
                    {depositEligibleMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {(paymentMethodId || Number(securityDeposit) > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {surchargePercent > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Card Reference Number</span>
                      <input
                        type="text"
                        value={settlementRef}
                        onChange={(e) => setSettlementRef(e.target.value)}
                        placeholder="e.g. terminal receipt #"
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Payment routes to Card Settlements for reconciliation</p>
                    </label>
                  </div>
                ) : routedPaymentAcct ? null : (
                  <div className="rounded-lg border border-gray-200 p-4">
                    <label className="block">
                      <span className="text-sm font-medium text-gray-700">Payment Account (Cash/Bank)</span>
                      <select
                        value={paymentAccountId}
                        onChange={(e) => setPaymentAccountId(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select account...</option>
                        {paymentAccountOptions.map((a) => (
                          <option key={a.id} value={a.id}>{(a as { name?: string }).name}</option>
                        ))}
                      </select>
                      {paymentMethodId && <p className="mt-1 text-xs text-amber-600">No routing rule configured — select manually</p>}
                    </label>
                  </div>
                )}
                {!routedDepositLiability && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Deposit Liability Account</span>
                    <select
                      value={depositLiabilityAccountId}
                      onChange={(e) => setDepositLiabilityAccountId(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Select account...</option>
                      {depositLiabilityAccountOptions.map((a) => (
                        <option key={a.id} value={a.id}>{(a as { name?: string }).name}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-xs text-gray-500">Required when security deposit &gt; 0</p>
                  </label>
                </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-gray-200 p-4">
                <label className="block">
                  <span className="text-sm font-medium text-gray-700">
                    Security Deposit {!waiveDeposit && <span className="text-red-500">*</span>}
                  </span>
                  <input
                    type="number"
                    value={waiveDeposit ? '' : securityDeposit}
                    onChange={(e) => setSecurityDeposit(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="0"
                    disabled={waiveDeposit}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                  />
                </label>
                <label className="mt-2 flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={waiveDeposit}
                    onChange={(e) => {
                      setWaiveDeposit(e.target.checked);
                      if (e.target.checked) setSecurityDeposit(0);
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Waive deposit
                </label>
              </div>

              {webQuote > 0 && (
                <div className="rounded-lg border border-gray-200 p-4">
                  <h3 className="text-sm font-medium text-gray-700">Web Quote Comparison</h3>
                  <div className="mt-2 flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Website:</span>{' '}
                      <span className="font-medium">{formatCurrency(webQuote)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Actual:</span>{' '}
                      <span className="font-bold">{formatCurrency(finalTotal)}</span>
                    </div>
                    <Badge color={finalTotal > webQuote ? 'red' : finalTotal < webQuote ? 'green' : 'gray'}>
                      {finalTotal > webQuote
                        ? `+${formatCurrency(finalTotal - webQuote)}`
                        : finalTotal < webQuote
                          ? `-${formatCurrency(webQuote - finalTotal)}`
                          : 'Match'}
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {!receivableAccount && !incomeAccount && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                No chart of accounts configured. Set up a Receivable account (Asset) and Rental Income account in Settings &gt; Chart of Accounts to enable full accounting integration. You can still activate orders without them.
              </div>
            )}

            {(processMutation.error || collectMutation.error) && (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
                {((processMutation.error ?? collectMutation.error) as Error).message}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer navigation */}
      <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
        <button
          onClick={canGoBack ? goBack : onClose}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {canGoBack ? 'Back' : 'Cancel'}
        </button>

        {step === 'summary' ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleCollectPayment}
              disabled={collectMutation.isPending || !paymentMethodId}
              className="rounded-lg border border-blue-600 px-5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-50"
              title="Record payment without activating the order"
            >
              {collectMutation.isPending ? 'Collecting...' : 'Collect Payment'}
            </button>
            <button
              onClick={handleActivate}
              disabled={processMutation.isPending || !depositValid}
              className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              title={!depositValid ? 'Security deposit is required (or waive it)' : undefined}
            >
              {processMutation.isPending ? 'Activating...' : 'Activate Order'}
            </button>
          </div>
        ) : (
          <button
            onClick={goNext}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Next
          </button>
        )}
      </div>
    </Modal>
  );
}
