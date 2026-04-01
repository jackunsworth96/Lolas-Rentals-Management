import { useState } from 'react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { useEmployees, type EmployeeRow } from '../../api/hr.js';
import { Table } from '../../components/common/Table.js';
import { formatCurrency } from '../../utils/currency.js';
import { RunPayrollModal } from '../../components/hr/RunPayrollModal.js';

export default function PayrollPage() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const { data: employees, isLoading } = useEmployees(storeId);
  const [showRunPayroll, setShowRunPayroll] = useState(false);

  const canRunPayroll = hasPermission('can_view_payroll');

  if (isLoading) return <div className="py-12 text-center text-gray-500">Loading...</div>;

  const columns = [
    { key: 'fullName', header: 'Employee' },
    { key: 'role', header: 'Role' },
    { key: 'basicRate', header: 'Basic Rate', render: (r: EmployeeRow) => formatCurrency(r.basicRate ?? 0) },
    { key: 'paidAs', header: 'Paid As' },
    { key: 'status', header: 'Status' },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        {canRunPayroll && (
          <button
            onClick={() => setShowRunPayroll(true)}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            Run Payroll
          </button>
        )}
      </div>
      <Table columns={columns} data={employees ?? []} keyFn={(r: EmployeeRow) => r.id} emptyMessage="No employees" />
      <RunPayrollModal
        isOpen={showRunPayroll}
        onClose={() => setShowRunPayroll(false)}
        storeId={storeId}
      />
    </div>
  );
}
