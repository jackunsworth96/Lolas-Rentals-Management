import { useState, useMemo } from 'react';
import { usePendingSettlements, useSettledSettlements, useCardBalance } from '../../api/card-settlements.js';
import { useStores } from '../../api/config.js';
import { Table } from '../../components/common/Table.js';
import { Badge } from '../../components/common/Badge.js';
import { MatchSettlementModal } from '../../components/card-settlements/MatchSettlementModal.js';
import { BatchEditModal } from '../../components/card-settlements/BatchEditModal.js';
import { CombineSettlementsModal } from '../../components/card-settlements/CombineSettlementsModal.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';

type Tab = 'pending' | 'settled';

interface SettlementRow {
  id: string;
  storeId: string;
  orderId: string | null;
  name: string | null;
  amount: number;
  refNumber: string | null;
  transactionDate: string | null;
  forecastedDate: string | null;
  isPaid: boolean;
  dateSettled: string | null;
  settlementRef: string | null;
  netAmount: number | null;
  feeExpense: number | null;
  batchNo: string | null;
  createdAt: string;
}

export default function CardSettlementsPage() {
  const [tab, setTab] = useState<Tab>('pending');
  const [storeFilter, setStoreFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matchOpen, setMatchOpen] = useState(false);
  const [batchEditOpen, setBatchEditOpen] = useState(false);
  const [combineOpen, setCombineOpen] = useState(false);

  const { data: stores = [] } = useStores();
  const { data: balance } = useCardBalance();
  const { data: pendingData, isLoading: pendingLoading } = usePendingSettlements(storeFilter);
  const { data: settledData, isLoading: settledLoading } = useSettledSettlements(storeFilter, dateFrom || undefined, dateTo || undefined);

  const storeList = stores as Array<{ id: string; name: string }>;
  const balanceData = balance as { total: number; byStore: Record<string, number> } | undefined;
  const pendingRows = (pendingData ?? []) as SettlementRow[];
  const settledRows = (settledData ?? []) as SettlementRow[];

  const getStoreName = (id: string) => storeList.find((s) => s.id === id)?.name ?? id;

  const filteredPending = useMemo(() =>
    pendingRows.filter((r) =>
      !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.orderId ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.refNumber ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  [pendingRows, search]);

  const filteredSettled = useMemo(() =>
    settledRows.filter((r) =>
      !search || (r.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.orderId ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (r.settlementRef ?? '').toLowerCase().includes(search.toLowerCase()),
    ),
  [settledRows, search]);

  const pendingTotal = pendingRows.reduce((s, r) => s + r.amount, 0);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredPending.length) setSelected(new Set());
    else setSelected(new Set(filteredPending.map((r) => r.id)));
  };

  const selectedRows = filteredPending.filter((r) => selected.has(r.id));

  const pendingColumns = [
    {
      key: 'select',
      header: '',
      render: (r: SettlementRow) => (
        <input type="checkbox" checked={selected.has(r.id)}
          onChange={() => toggleSelect(r.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-blue-600" />
      ),
      className: 'w-10',
    },
    { key: 'orderId', header: 'Order', render: (r: SettlementRow) => r.orderId ?? '—' },
    { key: 'name', header: 'Customer', render: (r: SettlementRow) => r.name ?? '—' },
    { key: 'transactionDate', header: 'Txn date', render: (r: SettlementRow) => r.transactionDate ? formatDate(r.transactionDate) : formatDate(r.createdAt?.slice(0, 10)) },
    { key: 'amount', header: 'Amount', render: (r: SettlementRow) => formatCurrency(r.amount) },
    { key: 'refNumber', header: 'Card ref', render: (r: SettlementRow) => r.refNumber ?? '—' },
    { key: 'forecastedDate', header: 'Forecast', render: (r: SettlementRow) => r.forecastedDate ? formatDate(r.forecastedDate) : '—' },
    { key: 'storeId', header: 'Store', render: (r: SettlementRow) => getStoreName(r.storeId) },
    {
      key: 'batchNo',
      header: 'Batch',
      render: (r: SettlementRow) => r.batchNo ? <Badge color="purple">{r.batchNo}</Badge> : '—',
    },
  ];

  const settledColumns = [
    { key: 'orderId', header: 'Order', render: (r: SettlementRow) => r.orderId ?? '—' },
    { key: 'name', header: 'Customer', render: (r: SettlementRow) => r.name ?? '—' },
    { key: 'dateSettled', header: 'Settled', render: (r: SettlementRow) => r.dateSettled ? formatDate(r.dateSettled) : '—' },
    { key: 'settlementRef', header: 'Bank ref', render: (r: SettlementRow) => r.settlementRef ?? '—' },
    { key: 'amount', header: 'Gross', render: (r: SettlementRow) => formatCurrency(r.amount) },
    { key: 'netAmount', header: 'Net', render: (r: SettlementRow) => r.netAmount != null ? formatCurrency(r.netAmount) : '—' },
    { key: 'feeExpense', header: 'Fee', render: (r: SettlementRow) => r.feeExpense != null ? formatCurrency(r.feeExpense) : '—' },
    { key: 'storeId', header: 'Store', render: (r: SettlementRow) => getStoreName(r.storeId) },
    {
      key: 'batchNo',
      header: 'Batch',
      render: (r: SettlementRow) => r.batchNo ? <Badge color="purple">{r.batchNo}</Badge> : '—',
    },
  ];

  const isLoading = tab === 'pending' ? pendingLoading : settledLoading;

  return (
    <div>
      {/* KPI Banner */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4 shadow-sm sm:col-span-1">
          <p className="text-sm text-gray-500">Card terminal balance (all stores)</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(balanceData?.total ?? 0)}</p>
        </div>
        {[...storeList].sort((a, b) => {
          const aIsLolas = a.name.toLowerCase().includes('lola');
          const bIsLolas = b.name.toLowerCase().includes('lola');
          if (aIsLolas && !bIsLolas) return -1;
          if (!aIsLolas && bIsLolas) return 1;
          return a.name.localeCompare(b.name);
        }).map((s) => (
          <div key={s.id} className="rounded-lg bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">{s.name}</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(balanceData?.byStore?.[s.id] ?? 0)}</p>
          </div>
        ))}
      </div>

      {/* Header + tabs */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">Card Settlements</h1>
          <div className="flex rounded-lg border border-gray-300 p-0.5">
            <button type="button" onClick={() => { setTab('pending'); setSelected(new Set()); }}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === 'pending' ? 'bg-gray-200 font-medium' : 'text-gray-600'}`}>
              Pending
            </button>
            <button type="button" onClick={() => { setTab('settled'); setSelected(new Set()); }}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === 'settled' ? 'bg-gray-200 font-medium' : 'text-gray-600'}`}>
              Settled
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All stores</option>
            {storeList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..."
            className="w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          {tab === 'settled' && (
            <>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <span className="text-gray-500 text-sm">to</span>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </>
          )}
        </div>
      </div>

      {/* Batch actions for pending tab */}
      {tab === 'pending' && selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-blue-50 px-4 py-3">
          <span className="text-sm font-medium text-blue-700">{selected.size} selected · {formatCurrency(selectedRows.reduce((s, r) => s + r.amount, 0))}</span>
          <button type="button" onClick={() => setMatchOpen(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Match settlement
          </button>
          <button type="button" onClick={() => setBatchEditOpen(true)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Batch edit
          </button>
          {selected.size >= 2 && (
            <button type="button" onClick={() => setCombineOpen(true)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Combine
            </button>
          )}
        </div>
      )}

      {/* Select all for pending */}
      {tab === 'pending' && filteredPending.length > 0 && (
        <div className="mb-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={selected.size === filteredPending.length && filteredPending.length > 0}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-gray-300 text-blue-600" />
            Select all ({filteredPending.length})
          </label>
          <span className="ml-4 text-sm text-gray-500">Running total: {formatCurrency(pendingTotal)}</span>
        </div>
      )}

      {isLoading && <div className="py-12 text-center text-gray-500">Loading...</div>}

      {!isLoading && tab === 'pending' && (
        <Table
          columns={pendingColumns}
          data={filteredPending}
          keyFn={(r) => r.id}
          emptyMessage="No pending settlements"
        />
      )}

      {!isLoading && tab === 'settled' && (
        <Table
          columns={settledColumns}
          data={filteredSettled}
          keyFn={(r) => r.id}
          emptyMessage="No settled records"
        />
      )}

      {matchOpen && (
        <MatchSettlementModal
          open
          onClose={() => { setMatchOpen(false); setSelected(new Set()); }}
          selected={selectedRows}
        />
      )}
      {batchEditOpen && (
        <BatchEditModal
          open
          onClose={() => { setBatchEditOpen(false); setSelected(new Set()); }}
          selectedIds={[...selected]}
        />
      )}
      {combineOpen && (
        <CombineSettlementsModal
          open
          onClose={() => { setCombineOpen(false); setSelected(new Set()); }}
          selected={selectedRows}
        />
      )}
    </div>
  );
}
