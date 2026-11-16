import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';

export interface VehicleOwnerAgreement {
  id: string;
  ownerName: string;
  feePct: number;
  startPeriod: string;
}

export interface OwnerVehicleLine {
  vehicleId: string;
  vehicleName: string;
  rentalDays: number;
  revenue: number;
  costs: number;
}

export interface OwnerBookingLine {
  orderId: string;
  vehicleName: string;
  pickup: string | null;
  dropoff: string | null;
  daysInMonth: number;
  revenue: number;
  /** Fuel, damage and other charges at return. Shown for reference; not part of revenue. */
  returnCharges?: number;
  returnChargesNote?: string | null;
}

export interface OwnerCostLine {
  expenseId: string;
  date: string;
  vehicleName: string;
  category: string;
  description: string | null;
  amount: number;
}

export interface OwnerLedgerLine {
  id: string;
  date: string;
  kind: 'share' | 'personal' | 'collected' | 'paid' | 'other';
  description: string | null;
  /** Positive increases what Lola's owes the owner. */
  amount: number;
}

export interface OwnerStatementMonth {
  period: string;
  closed: boolean;
  closedAt: string | null;
  note: string | null;
  revenue: number;
  vehicleCosts: number;
  net: number;
  fee: number;
  ownerShare: number;
  personal: number;
  collected: number;
  paid: number;
  other: number;
  openingBalance: number;
  closingBalance: number;
  vehicles: OwnerVehicleLine[];
  bookings: OwnerBookingLine[];
  costs: OwnerCostLine[];
  ledger: OwnerLedgerLine[];
}

export interface OwnerStatement {
  agreement: { id: string; ownerName: string; feePct: number; payableAccountId: string; startPeriod: string; notes: string | null };
  vehicles: Array<{ id: string; name: string; status: string; storeId: string }>;
  balanceOwed: number;
  projectedBalance: number;
  months: OwnerStatementMonth[];
}

export function useVehicleOwners() {
  return useQuery<VehicleOwnerAgreement[]>({
    queryKey: ['vehicle-owners'],
    queryFn: () => api.get<VehicleOwnerAgreement[]>('/vehicle-owners'),
  });
}

export function useOwnerStatement(agreementId: string) {
  return useQuery<OwnerStatement>({
    queryKey: ['owner-statement', agreementId],
    queryFn: () => api.get<OwnerStatement>(`/vehicle-owners/${encodeURIComponent(agreementId)}/statement`),
    enabled: !!agreementId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['owner-statement', 'balances', 'balances-v2', 'account-summary', 'account-ledger', 'journal-entries', 'dashboard']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

export function useCloseOwnerMonth(agreementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (period: string) => api.post(`/vehicle-owners/${encodeURIComponent(agreementId)}/close-month`, { period }),
    onSuccess: () => invalidate(qc),
  });
}

export interface OwnerPayoutPayload {
  amount: number;
  fromAccountId: string;
  date: string;
  note: string;
}

export function useOwnerPayout(agreementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OwnerPayoutPayload) => api.post(`/vehicle-owners/${encodeURIComponent(agreementId)}/payout`, body),
    onSuccess: () => invalidate(qc),
  });
}
