import { useState, useMemo } from 'react';
import { useStores } from '../../api/config.js';
import { useAllEmployees, type EmployeeRow } from '../../api/hr.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { Button } from '../../components/common/Button.js';
import { formatCurrency } from '../../utils/currency.js';
import { EmployeeModal } from '../../components/hr/EmployeeModal.js';
import { GrantCashAdvanceModal } from '../../components/hr/GrantCashAdvanceModal.js';

export default function EmployeesPage() {
  const { data: employees = [], isLoading } = useAllEmployees();
  const { data: stores = [] } = useStores() as { data: Array<{ id: string; name: string }> | undefined };

  const [search, setSearch] = useState('');
  const [filterStore, setFilterStore] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [advanceTarget, setAdvanceTarget] = useState<EmployeeRow | null>(null);

  const storeLookup = useMemo(
    () => new Map(stores.map((s) => [s.id, s.name])),
    [stores],
  );

  const filtered = useMemo(() => {
    let list = employees;
    if (filterStore) list = list.filter((e) => e.storeId === filterStore);
    if (filterStatus) list = list.filter((e) => e.status === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.fullName.toLowerCase().includes(q) ||
          (e.role ?? '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [employees, filterStore, filterStatus, search]);

  const columns = [
    {
      key: 'fullName',
      header: 'Full Name',
      render: (r: EmployeeRow) => (
        <div>
          <span className="font-medium text-gray-900">{r.fullName}</span>
          {r.currentCashAdvance > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {formatCurrency(r.currentCashAdvance)} advance
            </span>
          )}
        </div>
      ),
    },
    { key: 'role', header: 'Role', render: (r: EmployeeRow) => r.role ?? '—' },
    {
      key: 'storeId',
      header: 'Store',
      render: (r: EmployeeRow) => storeLookup.get(r.storeId ?? '') ?? '—',
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: EmployeeRow) => (
        <Badge color={r.status === 'Active' ? 'green' : 'gray'}>{r.status}</Badge>
      ),
    },
    {
      key: 'rateType',
      header: 'Rate Type',
      render: (r: EmployeeRow) =>
        r.rateType ? r.rateType.charAt(0).toUpperCase() + r.rateType.slice(1) : '—',
    },
    {
      key: 'basicRate',
      header: 'Basic Rate',
      render: (r: EmployeeRow) => formatCurrency(r.basicRate ?? 0),
    },
    {
      key: 'startDate',
      header: 'Start Date',
      render: (r: EmployeeRow) => r.startDate ?? '—',
    },
    {
      key: 'actions',
      header: '',
      render: (r: EmployeeRow) =>
        r.status === 'Active' ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setAdvanceTarget(r);
            }}
            className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
          >
            Grant Advance
          </button>
        ) : null,
    },
  ];

  // Determine the storeId to pass to the advance modal.
  // Use the employee's primary store, falling back to the filter or first store.
  const advanceStoreId =
    advanceTarget?.storeId ??
    filterStore ??
    stores[0]?.id ??
    '';

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setAdvanceTarget({} as EmployeeRow)}
          >
            Grant Cash Advance
          </Button>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            Add Employee
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Search by name or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={filterStore}
          onChange={(e) => setFilterStore(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Stores</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <Table
          columns={columns}
          data={filtered}
          keyFn={(r) => r.id}
          onRowClick={(r) => setSelectedEmployee(r)}
          emptyMessage="No employees found"
        />
      )}

      {showCreate && (
        <EmployeeModal
          stores={stores}
          onClose={() => setShowCreate(false)}
        />
      )}

      {selectedEmployee && (
        <EmployeeModal
          employee={selectedEmployee}
          stores={stores}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {/* Grant Cash Advance modal — opened from the page-level button (no pre-fill)
          or from a row-level button (employee pre-filled) */}
      <GrantCashAdvanceModal
        open={!!advanceTarget}
        onClose={() => setAdvanceTarget(null)}
        employeeId={advanceTarget?.id}
        employeeName={advanceTarget?.fullName}
        storeId={advanceStoreId}
        employees={employees.filter((e) => e.status === 'Active')}
      />
    </div>
  );
}
