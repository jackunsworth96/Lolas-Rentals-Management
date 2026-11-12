import type { ContractCategory, ContractStatus } from '@lolas/shared';
import { Badge } from '../common/Badge.js';

export const CONTRACT_PERMISSIONS = ['can_manage_contracts', 'can_manage_staff_contracts'] as const;

export function canUseContracts(permissions: string[]): boolean {
  return CONTRACT_PERMISSIONS.some((p) => permissions.includes(p));
}

/** Mirrors the API: staff contracts need the HR permission, all others the contracts permission. */
export function allowedContractCategories(permissions: string[]): ContractCategory[] {
  const out: ContractCategory[] = [];
  if (permissions.includes('can_manage_contracts')) out.push('accommodation_partner', 'paw_card_partner');
  if (permissions.includes('can_manage_staff_contracts')) out.push('staff');
  if (permissions.includes('can_manage_contracts')) out.push('other');
  return out;
}

const STATUS: Record<ContractStatus, { label: string; color: 'gray' | 'blue' | 'amber' | 'green' | 'red' | 'purple' }> = {
  draft: { label: 'Draft', color: 'gray' },
  sent: { label: 'Sent', color: 'blue' },
  viewed: { label: 'Viewed', color: 'purple' },
  completed: { label: 'Signed', color: 'green' },
  expired: { label: 'Link expired', color: 'amber' },
  voided: { label: 'Void', color: 'red' },
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const s = STATUS[status];
  return <Badge color={s.color}>{s.label}</Badge>;
}

export function fmtContractDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
