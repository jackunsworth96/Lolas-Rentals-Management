import { Link } from 'react-router-dom';
import type { ContractCategory, ContractCounterpartyType } from '@lolas/shared';
import { useContracts } from '../../api/contracts.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { ContractStatusBadge, allowedContractCategories, fmtContractDateTime } from './contract-ui.js';

interface Props {
  category: ContractCategory;
  counterpartyType: ContractCounterpartyType;
  counterpartyId: string;
}

/** Contracts for one partner, establishment or employee, with a shortcut to create one. */
export function LinkedContracts({ category, counterpartyType, counterpartyId }: Props) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const allowed = allowedContractCategories(permissions).includes(category);
  const { data: contracts = [], isLoading } = useContracts({ counterpartyType, counterpartyId }, allowed);
  if (!allowed) return null;

  const newHref = `/contracts?new=1&category=${category}&counterpartyType=${counterpartyType}&counterpartyId=${encodeURIComponent(counterpartyId)}`;

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">Contracts</h4>
        <Link to={newHref} className="text-xs font-medium text-teal-700 hover:underline">New contract</Link>
      </div>
      {isLoading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : contracts.length === 0 ? (
        <p className="text-xs text-gray-500">No contracts yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {contracts.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <Link to={`/contracts?open=${c.id}`} className="min-w-0 truncate text-gray-800 hover:underline">{c.title}</Link>
              <span className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                {fmtContractDateTime(c.signedAt ?? c.sentAt ?? c.createdAt)}
                <ContractStatusBadge status={c.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
