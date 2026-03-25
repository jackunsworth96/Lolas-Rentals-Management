import { useState, useMemo } from 'react';
import { useTaskReport, type TaskReportRow } from '../../api/todo.js';
import { useUIStore } from '../../stores/ui-store.js';
import { DatePicker } from '../../components/common/DatePicker.js';
import { Button } from '../../components/common/Button.js';
import { Table } from '../../components/common/Table.js';

function defaultFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ReportTab() {
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const { data: rows = [], isLoading } = useTaskReport({ storeId, from, to });

  const totals = useMemo(() => {
    if (rows.length === 0) return null;
    const t = {
      totalAssigned: 0,
      completedOnTime: 0,
      completedLate: 0,
      rejectedCount: 0,
    };
    for (const r of rows) {
      t.totalAssigned += r.totalAssigned;
      t.completedOnTime += r.completedOnTime;
      t.completedLate += r.completedLate;
      t.rejectedCount += r.rejectedCount;
    }
    return t;
  }, [rows]);

  const handleExportCSV = () => {
    if (rows.length === 0) return;
    const headers = [
      'Employee',
      'Total Assigned',
      'Completed On Time',
      'Completed Late',
      'Rejected Count',
      'Avg Hours to Complete',
    ];
    const csvRows = rows.map((r) => [
      `"${r.employeeName}"`,
      r.totalAssigned,
      r.completedOnTime,
      r.completedLate,
      r.rejectedCount,
      r.avgHoursToComplete ?? '',
    ]);
    const csv = [headers.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns = [
    { key: 'employeeName', header: 'Employee' },
    { key: 'totalAssigned', header: 'Assigned' },
    { key: 'completedOnTime', header: 'On Time' },
    { key: 'completedLate', header: 'Late' },
    { key: 'rejectedCount', header: 'Rejected' },
    {
      key: 'avgHoursToComplete',
      header: 'Avg Hours',
      render: (r: TaskReportRow) =>
        r.avgHoursToComplete != null ? `${r.avgHoursToComplete}h` : '—',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Date range selector */}
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker label="From" value={from} onChange={(e) => setFrom(e.target.value)} />
        <DatePicker label="To" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button
          size="sm"
          variant="secondary"
          onClick={handleExportCSV}
          disabled={rows.length === 0}
        >
          Export CSV
        </Button>
      </div>

      {/* Summary cards */}
      {totals && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Total Assigned" value={totals.totalAssigned} />
          <SummaryCard label="On Time" value={totals.completedOnTime} color="text-green-600" />
          <SummaryCard label="Late" value={totals.completedLate} color="text-red-600" />
          <SummaryCard label="Rejected" value={totals.rejectedCount} color="text-orange-600" />
        </div>
      )}

      {/* Report table */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading report...</div>
      ) : (
        <Table<TaskReportRow>
          columns={columns}
          data={rows}
          keyFn={(r) => r.employeeId}
          emptyMessage="No data for this date range"
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = 'text-gray-900',
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
