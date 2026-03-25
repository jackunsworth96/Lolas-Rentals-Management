import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '../../stores/ui-store.js';
import { useEmployees } from '../../api/hr.js';
import { Table } from '../../components/common/Table.js';
import { formatCurrency } from '../../utils/currency.js';

export default function PayrollPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const { data: employees, isLoading } = useEmployees(storeId) as { data: any[]; isLoading: boolean };

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading...</div>;

  const columns = [
    { key: 'fullName', header: 'Employee' },
    { key: 'role', header: 'Role' },
    { key: 'basicRate', header: 'Basic Rate', render: (r: any) => formatCurrency(r.basicRate ?? 0) },
    { key: 'paidAs', header: 'Paid As' },
    { key: 'status', header: 'Status' },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Payroll</h1>
      <Table columns={columns} data={employees ?? []} keyFn={(r: any) => r.id} emptyMessage="No employees" />
    </div>
  );
}
