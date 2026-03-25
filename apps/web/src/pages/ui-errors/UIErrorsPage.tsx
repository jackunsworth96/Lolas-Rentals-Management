import { useState, useCallback } from 'react';
import {
  useUIErrors,
  useCreateUIError,
  useUpdateUIErrorFixed,
  type UiErrorStatusFilter,
  type UIErrorRow,
} from '../../api/ui-errors.js';
import { formatDateTime } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';
import { Badge } from '../../components/common/Badge.js';
import { Table } from '../../components/common/Table.js';

/** Pages staff can pick when reporting — mirrors main nav + common areas */
const REPORT_PAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '/orders/inbox', label: 'Orders — Inbox' },
  { value: '/orders/active', label: 'Orders — Active' },
  { value: '/orders/completed', label: 'Orders — Completed' },
  { value: '/fleet', label: 'Fleet' },
  { value: '/fleet/utilization', label: 'Fleet — Utilization' },
  { value: '/maintenance', label: 'Maintenance' },
  { value: '/transfers', label: 'Transfers' },
  { value: '/accounts', label: 'Accounts' },
  { value: '/card-settlements', label: 'Card Settlements' },
  { value: '/cashup', label: 'Cash Up' },
  { value: '/hr/timesheets', label: 'HR — Timesheets' },
  { value: '/hr/payroll', label: 'HR — Payroll' },
  { value: '/expenses', label: 'Expenses' },
  { value: '/todo', label: 'To Do' },
  { value: '/misc-sales', label: 'Misc Sales' },
  { value: '/merchandise', label: 'Merchandise' },
  { value: '/lost-opportunity', label: 'Lost Opportunity' },
  { value: '/settings', label: 'Settings' },
  { value: '/ui-errors', label: 'UI Errors (this page)' },
  { value: '__other__', label: 'Other…' },
];

const OTHER_VALUE = '__other__';

export default function UIErrorsPage() {
  const [status, setStatus] = useState<UiErrorStatusFilter>('all');
  const { data: rows = [], isLoading, isError, error } = useUIErrors(status);
  const createMut = useCreateUIError();
  const updateMut = useUpdateUIErrorFixed();

  const [showModal, setShowModal] = useState(false);
  const [pageSelect, setPageSelect] = useState(REPORT_PAGE_OPTIONS[0]?.value ?? '');
  const [customPage, setCustomPage] = useState('');
  const [errorDescription, setErrorDescription] = useState('');
  const [ideaAndImprovements, setIdeaAndImprovements] = useState('');

  const openModal = useCallback(() => {
    setPageSelect(REPORT_PAGE_OPTIONS[0]?.value ?? '');
    setCustomPage('');
    setErrorDescription('');
    setIdeaAndImprovements('');
    setShowModal(true);
  }, []);

  const resolvedPage = pageSelect === OTHER_VALUE ? customPage.trim() : pageSelect;

  const canSubmit =
    resolvedPage.length > 0 &&
    errorDescription.trim().length > 0 &&
    (pageSelect !== OTHER_VALUE || customPage.trim().length > 0);

  function handleSubmit() {
    if (!canSubmit) return;
    createMut.mutate(
      {
        page: resolvedPage,
        errorDescription: errorDescription.trim(),
        ideaAndImprovements: ideaAndImprovements.trim() || null,
      },
      { onSuccess: () => setShowModal(false) },
    );
  }

  const filterTabs: { key: UiErrorStatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'outstanding', label: 'Outstanding' },
    { key: 'fixed', label: 'Completed' },
  ];

  const columns = [
    {
      key: 'createdAt',
      header: 'Reported',
      render: (r: UIErrorRow) => (
        <span className="text-gray-600">{formatDateTime(r.createdAt)}</span>
      ),
    },
    { key: 'page', header: 'Page' },
    {
      key: 'errorDescription',
      header: 'Description',
      className: 'max-w-xs',
      render: (r: UIErrorRow) => (
        <span className="line-clamp-2 whitespace-normal text-gray-800" title={r.errorDescription}>
          {r.errorDescription}
        </span>
      ),
    },
    {
      key: 'ideaAndImprovements',
      header: 'Ideas',
      className: 'max-w-xs',
      render: (r: UIErrorRow) => (
        <span className="line-clamp-2 whitespace-normal text-gray-500" title={r.ideaAndImprovements ?? ''}>
          {r.ideaAndImprovements ?? '—'}
        </span>
      ),
    },
    {
      key: 'employeeName',
      header: 'Reported by',
      render: (r: UIErrorRow) => r.employeeName ?? r.employeeId ?? '—',
    },
    {
      key: 'fixed',
      header: 'Status',
      render: (r: UIErrorRow) => (
        <Badge color={r.fixed ? 'green' : 'yellow'}>{r.fixed ? 'Fixed' : 'Open'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r: UIErrorRow) => (
        <Button
          size="sm"
          variant={r.fixed ? 'secondary' : 'ghost'}
          loading={updateMut.isPending}
          onClick={(e) => {
            e.stopPropagation();
            updateMut.mutate({ id: r.id, fixed: !r.fixed });
          }}
        >
          {r.fixed ? 'Reopen' : 'Mark fixed'}
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">UI Errors &amp; Improvements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Report bugs or confusing UI. Track what is still open versus completed.
          </p>
        </div>
        <Button onClick={openModal}>Report issue</Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
        {filterTabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              status === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {(error as Error).message}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <Table<UIErrorRow>
            columns={columns}
            data={rows}
            keyFn={(r) => r.id}
            emptyMessage="No reports yet. Use “Report issue” to add one."
          />
        </div>
      )}

      {showModal && (
        <ModalOverlay onClose={() => setShowModal(false)}>
          <div className="mx-auto w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-bold text-gray-900">Report UI issue</h2>
            <p className="mb-4 text-sm text-gray-500">
              Describe what went wrong or what should improve. Your account is recorded automatically.
            </p>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Page *</label>
                <select
                  value={pageSelect}
                  onChange={(e) => setPageSelect(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {REPORT_PAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {pageSelect === OTHER_VALUE && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Page path or name *</label>
                  <input
                    type="text"
                    value={customPage}
                    onChange={(e) => setCustomPage(e.target.value)}
                    placeholder="e.g. /orders/active or modal title"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">What happened? *</label>
                <textarea
                  value={errorDescription}
                  onChange={(e) => setErrorDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Steps to reproduce, what you expected, what you saw…"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Ideas &amp; improvements</label>
                <textarea
                  value={ideaAndImprovements}
                  onChange={(e) => setIdeaAndImprovements(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Optional — how could this be clearer or faster?"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleSubmit} loading={createMut.isPending} disabled={!canSubmit}>
                Submit report
              </Button>
            </div>
            {createMut.error && (
              <p className="mt-2 text-sm text-red-600">{(createMut.error as Error).message}</p>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 max-h-[90vh] w-full overflow-y-auto px-4">{children}</div>
    </div>
  );
}
