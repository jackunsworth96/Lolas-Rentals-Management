import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../../stores/ui-store.js';
import { api } from '../../api/client.js';
import { Table } from '../../components/common/Table.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate, currentPeriod } from '../../utils/date.js';

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const period = currentPeriod();

  const { data: entries, isLoading } = useQuery({
    queryKey: ['journal-entries', storeId, period, id],
    queryFn: () => api.get(`/accounting/entries?storeId=${storeId}&period=${period}`),
    enabled: !!storeId,
  }) as { data: any[]; isLoading: boolean };

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading...</div>;

  const filtered = (entries ?? []).filter((e: any) => e.accountId === id);

  const columns = [
    { key: 'date', header: 'Date', render: (r: any) => formatDate(r.date) },
    { key: 'description', header: 'Description' },
    { key: 'debit', header: 'Debit', render: (r: any) => r.debit > 0 ? formatCurrency(r.debit) : '' },
    { key: 'credit', header: 'Credit', render: (r: any) => r.credit > 0 ? formatCurrency(r.credit) : '' },
    { key: 'referenceType', header: 'Ref Type' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Account: {id}</h1>
      <Table columns={columns} data={filtered} keyFn={(r: any) => r.entryId} emptyMessage="No entries" />
    </div>
  );
}
