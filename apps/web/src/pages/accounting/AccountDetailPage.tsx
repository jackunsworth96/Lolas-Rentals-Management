import { useParams, useNavigate } from 'react-router-dom';
import { useAccountLedger } from '../../api/accounting.js';
import { useChartOfAccounts } from '../../api/config.js';
import { Table } from '../../components/common/Table.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

function currentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth() + 1;
  const month = `${year}-${String(m).padStart(2, '0')}`;
  const lastDay = new Date(year, m, 0).getDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

interface AccountRow {
  id: string;
  name: string;
  accountType?: string;
  storeId?: string | null;
}

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { from, to } = currentMonthRange();

  const { data: accounts = [] } = useChartOfAccounts() as { data: AccountRow[] };
  const account = accounts.find((a) => a.id === id);

  const { data: entries = [], isLoading } = useAccountLedger(id ?? '', from, to);

  const columns = [
    { key: 'date', header: 'Date', render: (r: any) => formatDate(r.date) },
    { key: 'description', header: 'Description' },
    {
      key: 'debit',
      header: 'Debit',
      render: (r: any) =>
        r.debit > 0 ? (
          <span className="font-lato tabular-nums">{formatCurrency(r.debit)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: 'credit',
      header: 'Credit',
      render: (r: any) =>
        r.credit > 0 ? (
          <span className="font-lato tabular-nums">{formatCurrency(r.credit)}</span>
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: 'referenceType', header: 'Ref Type' },
  ];

  if (isLoading) {
    return <div className="py-12 text-center text-gray-500">Loading ledger…</div>;
  }

  return (
    <div>
      <button
        onClick={() => navigate('/accounts')}
        className="mb-4 flex items-center gap-1 text-sm text-gray-500 hover:text-teal-brand"
      >
        ← Back to Accounts
      </button>

      <div className="mb-6">
        <h1 className="font-headline text-2xl text-teal-brand">
          {account ? account.name : id}
        </h1>
        {account && (
          <div className="mt-1 flex items-center gap-2">
            {account.accountType && (
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                {account.accountType}
              </span>
            )}
            {account.storeId && (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600">
                {account.storeId}
              </span>
            )}
            <span className="text-xs text-gray-400">
              {from} – {to}
            </span>
          </div>
        )}
      </div>

      <Table
        columns={columns}
        data={entries as any[]}
        keyFn={(r: any) => r.entryId}
        emptyMessage="No entries for this account in the current month."
      />
    </div>
  );
}
