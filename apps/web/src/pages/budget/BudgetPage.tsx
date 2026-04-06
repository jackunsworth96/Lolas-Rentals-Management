import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, Target, DollarSign, ChevronUp, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/auth-store.js';
import { useStores, useExpenseCategories } from '../../api/config.js';
import {
  useBudget,
  useAutofill,
  useUpsertBudgetLines,
  type BudgetResponse,
  type UpsertLine,
} from '../../api/budget.js';
import { formatCurrency } from '../../utils/currency.js';
import { useToast } from '../../hooks/useToast.js';

// ── Constants ──

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const TABS = ['Set Budget', 'Budget vs Actual', 'Forecast'] as const;
type TabKey = (typeof TABS)[number];

const CURRENT_MONTH = new Date().getMonth() + 1; // 1-indexed

// ── Shared row / section types ──

interface RowDef {
  lineType: string;
  categoryLabel: string;
}

interface SectionRowDef {
  key: string;
  lineType: string;
  label: string;
}

interface SectionDef {
  key: string;
  label: string;
  rows: SectionRowDef[];
  isRevenue: boolean;
}

const REVENUE_ROWS: RowDef[] = [
  { lineType: 'revenue', categoryLabel: 'Scooter & Vehicle Rentals' },
  { lineType: 'transfer_revenue', categoryLabel: 'Airport Transfers' },
  { lineType: 'misc_revenue', categoryLabel: 'Misc Sales' },
];

const PAYROLL_ROWS: RowDef[] = [
  { lineType: 'payroll', categoryLabel: 'Staff Salaries' },
];

const DEPRECIATION_ROWS: RowDef[] = [
  { lineType: 'depreciation', categoryLabel: 'Fleet Depreciation' },
];

const DRAWINGS_ROWS: RowDef[] = [
  { lineType: 'drawings', categoryLabel: 'Owner Drawings' },
];

const STATIC_SECTIONS: Omit<SectionDef, 'rows'>[] = [
  { key: 'revenue', label: 'Revenue', isRevenue: true },
  { key: 'expense', label: 'Operating Expenses', isRevenue: false },
  { key: 'payroll', label: 'Payroll', isRevenue: false },
  { key: 'depreciation', label: 'Depreciation', isRevenue: false },
  { key: 'drawings', label: 'Owner Drawings', isRevenue: false },
];

function rowDefsToSectionRows(rows: RowDef[]): SectionRowDef[] {
  return rows.map((r) => ({
    key: gk(r.lineType, r.categoryLabel),
    lineType: r.lineType,
    label: r.categoryLabel,
  }));
}

function buildSectionDefs(expenseRows: RowDef[]): SectionDef[] {
  const sectionRowsMap: Record<string, SectionRowDef[]> = {
    revenue: rowDefsToSectionRows(REVENUE_ROWS),
    expense: rowDefsToSectionRows(expenseRows),
    payroll: rowDefsToSectionRows(PAYROLL_ROWS),
    depreciation: rowDefsToSectionRows(DEPRECIATION_ROWS),
    drawings: rowDefsToSectionRows(DRAWINGS_ROWS),
  };
  return STATIC_SECTIONS.map((s) => ({ ...s, rows: sectionRowsMap[s.key] }));
}

// ── Types ──

type BudgetGrid = Record<string, Record<number, number>>;

interface CategoryConfig {
  id: string | number;
  name: string;
  isActive?: boolean;
  is_active?: boolean;
}

// ── Helpers ──

function gk(lineType: string, label: string): string {
  return `${lineType}__${label}`;
}

function parseKey(key: string): { lineType: string; categoryLabel: string } {
  const idx = key.indexOf('__');
  return { lineType: key.slice(0, idx), categoryLabel: key.slice(idx + 2) };
}

function cellVal(grid: BudgetGrid, key: string, month: number): number {
  return grid[key]?.[month] ?? 0;
}

function sumRow(grid: BudgetGrid, key: string): number {
  const months = grid[key];
  if (!months) return 0;
  return Object.values(months).reduce((a, b) => a + b, 0);
}

function sumSection(grid: BudgetGrid, rows: RowDef[], month: number): number {
  return rows.reduce((s, r) => s + cellVal(grid, gk(r.lineType, r.categoryLabel), month), 0);
}

function sumSectionTotal(grid: BudgetGrid, rows: RowDef[]): number {
  let t = 0;
  for (let m = 1; m <= 12; m++) t += sumSection(grid, rows, m);
  return t;
}

/** Build an actuals grid in the same shape as BudgetGrid */
function buildActualsMap(actuals: BudgetResponse['actuals']): BudgetGrid {
  const map: BudgetGrid = {};
  function add(key: string, month: number, amount: number) {
    if (!map[key]) map[key] = {};
    map[key][month] = (map[key][month] ?? 0) + amount;
  }

  for (const e of actuals.expenses) {
    add(gk('expense', e.categoryLabel), e.month, e.total);
  }

  const journalKeyMap: Record<string, string> = {
    payroll: gk('payroll', 'Staff Salaries'),
    depreciation: gk('depreciation', 'Fleet Depreciation'),
    drawings: gk('drawings', 'Owner Drawings'),
  };
  for (const j of actuals.journals) {
    const key = journalKeyMap[j.lineType];
    if (key) add(key, j.month, j.total);
  }

  for (const r of actuals.revenue) {
    add(gk(r.lineType, r.categoryLabel), r.month, r.total);
  }

  return map;
}

const REVENUE_LINE_TYPES = new Set(['revenue', 'transfer_revenue', 'misc_revenue']);

function isRevenueLineType(lineType: string): boolean {
  return REVENUE_LINE_TYPES.has(lineType);
}

/** Returns colour class for a variance value given line type */
function varianceColor(lineType: string, variance: number): string {
  if (variance === 0) return 'text-charcoal-brand';
  const isRev = isRevenueLineType(lineType);
  if (isRev) return variance > 0 ? 'text-emerald-600' : 'text-red-500';
  return variance < 0 ? 'text-emerald-600' : 'text-red-500';
}

function variancePct(variance: number, budget: number): string {
  if (budget === 0) return '\u2014';
  const pct = (variance / Math.abs(budget)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

// ── Component ──

export default function BudgetPage() {
  const user = useAuthStore((s) => s.user);
  const { data: allStores = [] } = useStores();
  const storeList = allStores as Array<{ id: string; name: string }>;

  const storeOptions = useMemo(() => {
    if (!user?.storeIds?.length) return storeList;
    return storeList.filter((s) => user.storeIds.includes(s.id));
  }, [storeList, user?.storeIds]);

  const currentYear = new Date().getFullYear();
  const [selectedStore, setSelectedStore] = useState<string | null>(
    user?.storeIds?.[0] ?? null,
  );
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<TabKey>('Set Budget');
  const [mobileMonth, setMobileMonth] = useState(new Date().getMonth() + 1);

  // Grid state
  const [grid, setGrid] = useState<BudgetGrid>({});
  const [initialGrid, setInitialGrid] = useState<BudgetGrid>({});

  // Data fetching
  const { data: budgetData, isLoading } = useBudget(selectedStore, year);
  const { refetch: refetchAutofill, isFetching: isAutofilling } = useAutofill(
    selectedStore,
    year,
    false,
  );
  const upsertMut = useUpsertBudgetLines();

  const { data: rawCategories = [] } = useExpenseCategories() as {
    data: CategoryConfig[] | undefined;
  };
  const activeCategories = useMemo(
    () =>
      (rawCategories as Array<CategoryConfig & Record<string, unknown>>).filter(
        (c) => c.isActive !== false && c.is_active !== false,
      ),
    [rawCategories],
  );

  const catIdMap = useMemo(
    () => new Map(activeCategories.map((c) => [c.name, Number(c.id)])),
    [activeCategories],
  );

  const expenseRows: RowDef[] = useMemo(
    () =>
      activeCategories.map((c) => ({
        lineType: 'expense',
        categoryLabel: c.name,
      })),
    [activeCategories],
  );

  const sectionDefs = useMemo(() => buildSectionDefs(expenseRows), [expenseRows]);

  const actualsMap = useMemo<BudgetGrid>(() => {
    if (!budgetData?.actuals) return {};
    return buildActualsMap(budgetData.actuals);
  }, [budgetData?.actuals]);

  const { toasts, pushToast } = useToast();

  // Populate grid when budget data loads
  useEffect(() => {
    if (!budgetData?.period) return;
    const g: BudgetGrid = {};
    for (const line of budgetData.period) {
      const key = gk(line.lineType, line.categoryLabel);
      if (!g[key]) g[key] = {};
      g[key][line.month] = line.amount;
    }
    setGrid(g);
    setInitialGrid(JSON.parse(JSON.stringify(g)));
  }, [budgetData?.period]);

  const isDirty = useMemo(
    () => JSON.stringify(grid) !== JSON.stringify(initialGrid),
    [grid, initialGrid],
  );

  // ── Handlers ──

  function handleCellChange(key: string, month: number, value: string) {
    const num = value === '' ? 0 : parseFloat(value);
    if (isNaN(num) || num < 0) return;
    setGrid((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? {}), [month]: num },
    }));
  }

  async function handleAutofill() {
    try {
      const result = await refetchAutofill();
      if (result.data?.lines) {
        setGrid((prev) => {
          const updated = { ...prev };
          for (const line of result.data!.lines) {
            const key = gk(line.lineType, line.categoryLabel);
            if (line.amount > 0) {
              updated[key] = { ...(updated[key] ?? {}), [line.month]: line.amount };
            }
          }
          return updated;
        });
        pushToast('Budget pre-filled from last year\u2019s actuals', 'success');
      }
    } catch {
      pushToast('Failed to load last year\u2019s data', 'error');
    }
  }

  function handleSave() {
    const lines: UpsertLine[] = [];
    for (const [key, months] of Object.entries(grid)) {
      const { lineType, categoryLabel } = parseKey(key);
      for (let m = 1; m <= 12; m++) {
        const amount = months[m] ?? 0;
        const hadInitial = (initialGrid[key]?.[m] ?? 0) > 0;
        if (amount === 0 && !hadInitial) continue;
        const line: UpsertLine = { lineType, categoryLabel, month: m, amount };
        if (lineType === 'expense') {
          const catId = catIdMap.get(categoryLabel);
          if (catId !== undefined) line.expenseCategoryId = catId;
        }
        lines.push(line);
      }
    }
    upsertMut.mutate(
      { storeId: selectedStore, year, lines },
      {
        onSuccess: () => {
          setInitialGrid(JSON.parse(JSON.stringify(grid)));
          pushToast('Budget saved', 'success');
        },
        onError: () => pushToast('Failed to save budget', 'error'),
      },
    );
  }

  // ── Section helpers for Set Budget tab ──

  function netForMonth(month: number): number {
    return (
      sumSection(grid, REVENUE_ROWS, month) -
      sumSection(grid, expenseRows, month) -
      sumSection(grid, PAYROLL_ROWS, month) -
      sumSection(grid, DEPRECIATION_ROWS, month) -
      sumSection(grid, DRAWINGS_ROWS, month)
    );
  }

  function netTotal(): number {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += netForMonth(m);
    return t;
  }

  const colSpan = 14;
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1];

  // ── Render ──

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Header row */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-headline text-2xl font-bold text-teal-brand">
          Budget
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Store selector */}
          <select
            value={selectedStore ?? '__company__'}
            onChange={(e) =>
              setSelectedStore(
                e.target.value === '__company__' ? null : e.target.value,
              )
            }
            className="font-lato rounded-lg border border-charcoal-brand/20 px-3 py-2 text-sm"
          >
            <option value="__company__">Company-Wide</option>
            {storeOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          {/* Year picker */}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="font-lato rounded-lg border border-charcoal-brand/20 px-3 py-2 text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {/* Tab switcher */}
          <div className="flex rounded-lg bg-sand-brand p-1">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`font-lato rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-teal-brand text-white'
                    : 'text-charcoal-brand hover:bg-teal-brand/10'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'Set Budget' && (
        <SetBudgetTab
          grid={grid}
          isLoading={isLoading}
          isDirty={isDirty}
          isSaving={upsertMut.isPending}
          isAutofilling={isAutofilling}
          expenseRows={expenseRows}
          mobileMonth={mobileMonth}
          setMobileMonth={setMobileMonth}
          onCellChange={handleCellChange}
          onAutofill={handleAutofill}
          onSave={handleSave}
          netForMonth={netForMonth}
          netTotal={netTotal}
          hasCategories={activeCategories.length > 0}
        />
      )}

      {activeTab === 'Budget vs Actual' && (
        <BudgetVsActualTab
          grid={grid}
          actualsMap={actualsMap}
          sectionDefs={sectionDefs}
          isLoading={isLoading}
          hasBudget={(budgetData?.period?.length ?? 0) > 0}
          year={year}
          onSwitchToSet={() => setActiveTab('Set Budget')}
        />
      )}

      {activeTab === 'Forecast' && (
        <ForecastTab
          grid={grid}
          actualsMap={actualsMap}
          sectionDefs={sectionDefs}
          isLoading={isLoading}
        />
      )}

      {/* Toast container */}
      <div className="fixed bottom-8 right-8 z-[60] flex flex-col-reverse items-end gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-toast-slide-up font-lato rounded-2xl px-5 py-3 text-sm font-bold shadow-lg ${
              t.type === 'success'
                ? 'bg-teal-brand text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SET BUDGET TAB
// ════════════════════════════════════════════════════════════

interface SetBudgetTabProps {
  grid: BudgetGrid;
  isLoading: boolean;
  isDirty: boolean;
  isSaving: boolean;
  isAutofilling: boolean;
  expenseRows: RowDef[];
  mobileMonth: number;
  setMobileMonth: (m: number) => void;
  onCellChange: (key: string, month: number, value: string) => void;
  onAutofill: () => void;
  onSave: () => void;
  netForMonth: (month: number) => number;
  netTotal: () => number;
  hasCategories: boolean;
}

function SetBudgetTab({
  grid,
  isLoading,
  isDirty,
  isSaving,
  isAutofilling,
  expenseRows,
  mobileMonth,
  setMobileMonth,
  onCellChange,
  onAutofill,
  onSave,
  netForMonth,
  netTotal,
  hasCategories,
}: SetBudgetTabProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded bg-sand-brand/50" />
        ))}
      </div>
    );
  }

  if (!hasCategories) {
    return (
      <div className="font-lato rounded-lg border border-charcoal-brand/10 bg-white p-12 text-center text-charcoal-brand/50">
        No expense categories found. Add categories in{' '}
        <span className="font-semibold text-teal-brand">Settings</span>.
      </div>
    );
  }

  const colSpan = 14;

  return (
    <>
      {/* Action buttons */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <select
          value={mobileMonth}
          onChange={(e) => setMobileMonth(Number(e.target.value))}
          className="font-lato rounded-lg border border-charcoal-brand/20 px-3 py-2 text-sm md:hidden"
        >
          {MONTHS.map((label, i) => (
            <option key={i} value={i + 1}>{label}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={onAutofill}
            disabled={isAutofilling}
            className="font-lato inline-flex items-center gap-2 rounded-lg border border-teal-brand bg-white px-4 py-2 text-sm text-teal-brand transition-colors hover:bg-teal-brand/5 disabled:opacity-50"
          >
            {isAutofilling && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-teal-brand border-t-transparent" />
            )}
            Auto-fill from Last Year
          </button>

          <button
            onClick={onSave}
            disabled={!isDirty || isSaving}
            className="font-lato inline-flex items-center gap-2 rounded-lg bg-gold-brand px-6 py-2 text-sm font-semibold text-charcoal-brand transition-colors hover:brightness-105 disabled:opacity-50"
          >
            {isSaving && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-charcoal-brand border-t-transparent" />
            )}
            Save Budget
          </button>
        </div>
      </div>

      {/* Budget grid table */}
      <div className="overflow-x-auto rounded-lg border border-charcoal-brand/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-charcoal-brand/10">
              <th className="font-lato sticky left-0 z-10 min-w-[180px] bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Category
              </th>
              {MONTHS.map((label, i) => (
                <th
                  key={i}
                  className={`font-lato min-w-[80px] px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60 ${
                    i + 1 === mobileMonth ? '' : 'hidden'
                  } md:table-cell`}
                >
                  {label}
                </th>
              ))}
              <th className="font-lato min-w-[90px] bg-sand-brand/30 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            <SectionHeader label="Revenue" colSpan={colSpan} />
            {REVENUE_ROWS.map((row) => (
              <DataRow key={gk(row.lineType, row.categoryLabel)} row={row} grid={grid} mobileMonth={mobileMonth} onCellChange={onCellChange} />
            ))}
            <SubtotalRow label="Total Revenue" grid={grid} rows={REVENUE_ROWS} mobileMonth={mobileMonth} />

            <SectionHeader label="Operating Expenses" colSpan={colSpan} />
            {expenseRows.map((row) => (
              <DataRow key={gk(row.lineType, row.categoryLabel)} row={row} grid={grid} mobileMonth={mobileMonth} onCellChange={onCellChange} />
            ))}
            <SubtotalRow label="Total Expenses" grid={grid} rows={expenseRows} mobileMonth={mobileMonth} />

            <SectionHeader label="Payroll" colSpan={colSpan} />
            {PAYROLL_ROWS.map((row) => (
              <DataRow key={gk(row.lineType, row.categoryLabel)} row={row} grid={grid} mobileMonth={mobileMonth} onCellChange={onCellChange} />
            ))}
            <SubtotalRow label="Total Payroll" grid={grid} rows={PAYROLL_ROWS} mobileMonth={mobileMonth} />

            <SectionHeader label="Depreciation" colSpan={colSpan} />
            {DEPRECIATION_ROWS.map((row) => (
              <DataRow key={gk(row.lineType, row.categoryLabel)} row={row} grid={grid} mobileMonth={mobileMonth} onCellChange={onCellChange} />
            ))}
            <SubtotalRow label="Total Depreciation" grid={grid} rows={DEPRECIATION_ROWS} mobileMonth={mobileMonth} />

            <SectionHeader label="Owner Drawings" colSpan={colSpan} />
            {DRAWINGS_ROWS.map((row) => (
              <DataRow key={gk(row.lineType, row.categoryLabel)} row={row} grid={grid} mobileMonth={mobileMonth} onCellChange={onCellChange} />
            ))}
            <SubtotalRow label="Total Drawings" grid={grid} rows={DRAWINGS_ROWS} mobileMonth={mobileMonth} />

            <tr className="bg-gold-brand/10">
              <td colSpan={colSpan} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
                Net Position
              </td>
            </tr>
            <NetRow netForMonth={netForMonth} netTotal={netTotal} mobileMonth={mobileMonth} />
          </tbody>
        </table>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// BUDGET VS ACTUAL TAB
// ════════════════════════════════════════════════════════════

interface BvaTabProps {
  grid: BudgetGrid;
  actualsMap: BudgetGrid;
  sectionDefs: SectionDef[];
  isLoading: boolean;
  hasBudget: boolean;
  year: number;
  onSwitchToSet: () => void;
}

function BudgetVsActualTab({
  grid,
  actualsMap,
  sectionDefs,
  isLoading,
  hasBudget,
  year,
  onSwitchToSet,
}: BvaTabProps) {
  const [viewMonth, setViewMonth] = useState<number | null>(null); // null = full year

  if (!hasBudget && !isLoading) {
    return (
      <div className="font-lato rounded-lg border border-charcoal-brand/10 bg-white p-12 text-center">
        <p className="mb-4 text-charcoal-brand/60">
          No budget set for <span className="font-semibold text-charcoal-brand">{year}</span>.
          Go to the &lsquo;Set Budget&rsquo; tab to get started.
        </p>
        <button
          onClick={onSwitchToSet}
          className="font-lato rounded-lg bg-gold-brand px-6 py-2 text-sm font-semibold text-charcoal-brand transition-colors hover:brightness-105"
        >
          Set Budget
        </button>
      </div>
    );
  }

  // Compute values for a row
  function rowValues(key: string) {
    let budget: number;
    let actual: number;
    if (viewMonth === null) {
      budget = sumRow(grid, key);
      actual = sumRow(actualsMap, key);
    } else {
      budget = cellVal(grid, key, viewMonth);
      actual = cellVal(actualsMap, key, viewMonth);
    }
    const variance = actual - budget;
    return { budget, actual, variance };
  }

  // Section totals
  function sectionValues(rows: SectionRowDef[]) {
    let budget = 0;
    let actual = 0;
    for (const r of rows) {
      const v = rowValues(r.key);
      budget += v.budget;
      actual += v.actual;
    }
    return { budget, actual, variance: actual - budget };
  }

  // Net across all sections
  function netValues() {
    let budgetRev = 0;
    let actualRev = 0;
    let budgetCost = 0;
    let actualCost = 0;
    for (const sec of sectionDefs) {
      const sv = sectionValues(sec.rows);
      if (sec.isRevenue) {
        budgetRev += sv.budget;
        actualRev += sv.actual;
      } else {
        budgetCost += sv.budget;
        actualCost += sv.actual;
      }
    }
    const budget = budgetRev - budgetCost;
    const actual = actualRev - actualCost;
    return { budget, actual, variance: actual - budget };
  }

  return (
    <>
      {/* Month filter pills */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="font-lato mr-1 text-sm font-medium text-charcoal-brand/60">View:</span>
        <button
          onClick={() => setViewMonth(null)}
          className={`font-lato rounded-full px-3 py-1 text-sm font-medium transition-colors ${
            viewMonth === null ? 'bg-teal-brand text-white' : 'bg-sand-brand text-charcoal-brand hover:bg-teal-brand/10'
          }`}
        >
          Full Year
        </button>
        {MONTHS.map((label, i) => (
          <button
            key={i}
            onClick={() => setViewMonth(i + 1)}
            className={`font-lato rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              viewMonth === i + 1 ? 'bg-teal-brand text-white' : 'bg-sand-brand text-charcoal-brand hover:bg-teal-brand/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto rounded-lg border border-charcoal-brand/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-charcoal-brand/10">
              <th className="font-lato min-w-[200px] px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Category
              </th>
              <th className="font-lato min-w-[110px] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Budget
              </th>
              <th className="font-lato min-w-[110px] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Actual
              </th>
              <th className="font-lato min-w-[110px] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Variance
              </th>
              <th className="font-lato min-w-[80px] px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Var %
              </th>
            </tr>
          </thead>
          <tbody>
            {sectionDefs.map((sec) => {
              const sv = sectionValues(sec.rows);
              const secLineType = sec.isRevenue ? 'revenue' : 'expense';
              return (
                <BvaSection
                  key={sec.key}
                  section={sec}
                  rowValues={rowValues}
                  sectionTotals={sv}
                  sectionLineType={secLineType}
                  isLoading={isLoading}
                />
              );
            })}

            {/* Net position */}
            {(() => {
              const nv = netValues();
              const vc = nv.variance >= 0 ? 'text-emerald-600' : 'text-red-500';
              return (
                <>
                  <tr className="bg-gold-brand/10">
                    <td colSpan={5} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
                      Net Position
                    </td>
                  </tr>
                  <tr className="border-t-2 border-charcoal-brand/20 bg-gold-brand/5">
                    <td className="font-lato px-4 py-2.5 text-sm font-bold text-charcoal-brand">
                      Net Profit / (Loss)
                    </td>
                    <td className={`font-lato px-3 py-2.5 text-right text-sm font-bold ${nv.budget >= 0 ? 'text-charcoal-brand' : 'text-red-500'}`}>
                      {isLoading ? <PulseCell /> : formatCurrency(nv.budget)}
                    </td>
                    <td className={`font-lato px-3 py-2.5 text-right text-sm font-bold ${vc}`}>
                      {isLoading ? <PulseCell /> : formatCurrency(nv.actual)}
                    </td>
                    <td className={`font-lato px-3 py-2.5 text-right text-sm font-bold ${vc}`}>
                      {isLoading ? <PulseCell /> : (
                        <span className="inline-flex items-center gap-1">
                          <VarianceArrow value={nv.variance} />
                          {formatCurrency(Math.abs(nv.variance))}
                        </span>
                      )}
                    </td>
                    <td className={`font-lato px-3 py-2.5 text-right text-sm font-bold ${vc}`}>
                      {isLoading ? <PulseCell /> : variancePct(nv.variance, nv.budget)}
                    </td>
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BvaSection({
  section,
  rowValues,
  sectionTotals,
  sectionLineType,
  isLoading,
}: {
  section: SectionDef;
  rowValues: (key: string) => { budget: number; actual: number; variance: number };
  sectionTotals: { budget: number; actual: number; variance: number };
  sectionLineType: string;
  isLoading: boolean;
}) {
  return (
    <>
      <tr className="bg-teal-brand/10">
        <td colSpan={5} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
          {section.label}
        </td>
      </tr>
      {section.rows.map((row) => {
        const v = rowValues(row.key);
        const lt = row.lineType;
        const vc = varianceColor(lt, v.variance);
        return (
          <tr key={row.key} className="border-b border-charcoal-brand/5 transition-colors hover:bg-cream-brand/40">
            <td className="font-lato px-4 py-2 text-sm text-charcoal-brand">{row.label}</td>
            <td className="font-lato px-3 py-2 text-right text-sm tabular-nums text-charcoal-brand">
              {isLoading ? <PulseCell /> : (v.budget ? formatCurrency(v.budget) : '\u2014')}
            </td>
            <td className="font-lato px-3 py-2 text-right text-sm tabular-nums text-charcoal-brand">
              {isLoading ? <PulseCell /> : (v.actual ? formatCurrency(v.actual) : '\u2014')}
            </td>
            <td className={`font-lato px-3 py-2 text-right text-sm tabular-nums ${vc}`}>
              {isLoading ? <PulseCell /> : (
                v.variance !== 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <VarianceArrow value={v.variance} />
                    {formatCurrency(Math.abs(v.variance))}
                  </span>
                ) : '\u2014'
              )}
            </td>
            <td className={`font-lato px-3 py-2 text-right text-sm tabular-nums ${vc}`}>
              {isLoading ? <PulseCell /> : variancePct(v.variance, v.budget)}
            </td>
          </tr>
        );
      })}
      {/* Subtotal */}
      <tr className="border-b border-charcoal-brand/10 bg-teal-brand/5">
        <td className="font-lato px-4 py-2 text-sm font-bold text-charcoal-brand">
          Total {section.label}
        </td>
        <td className="font-lato px-3 py-2 text-right text-sm font-semibold tabular-nums text-charcoal-brand">
          {isLoading ? <PulseCell /> : (sectionTotals.budget ? formatCurrency(sectionTotals.budget) : '\u2014')}
        </td>
        <td className="font-lato px-3 py-2 text-right text-sm font-semibold tabular-nums text-charcoal-brand">
          {isLoading ? <PulseCell /> : (sectionTotals.actual ? formatCurrency(sectionTotals.actual) : '\u2014')}
        </td>
        <td className={`font-lato px-3 py-2 text-right text-sm font-semibold tabular-nums ${varianceColor(sectionLineType, sectionTotals.variance)}`}>
          {isLoading ? <PulseCell /> : (
            sectionTotals.variance !== 0 ? (
              <span className="inline-flex items-center gap-1">
                <VarianceArrow value={sectionTotals.variance} />
                {formatCurrency(Math.abs(sectionTotals.variance))}
              </span>
            ) : '\u2014'
          )}
        </td>
        <td className={`font-lato px-3 py-2 text-right text-sm font-semibold tabular-nums ${varianceColor(sectionLineType, sectionTotals.variance)}`}>
          {isLoading ? <PulseCell /> : variancePct(sectionTotals.variance, sectionTotals.budget)}
        </td>
      </tr>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// FORECAST TAB
// ════════════════════════════════════════════════════════════

interface ForecastTabProps {
  grid: BudgetGrid;
  actualsMap: BudgetGrid;
  sectionDefs: SectionDef[];
  isLoading: boolean;
}

function ForecastTab({ grid, actualsMap, sectionDefs, isLoading }: ForecastTabProps) {
  /** Pick the value for a cell: actual for past, budget for future */
  function forecastCell(key: string, month: number): number {
    if (month < CURRENT_MONTH) return cellVal(actualsMap, key, month);
    if (month === CURRENT_MONTH) {
      const actual = cellVal(actualsMap, key, month);
      return actual || cellVal(grid, key, month);
    }
    return cellVal(grid, key, month);
  }

  function forecastRowTotal(key: string): number {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += forecastCell(key, m);
    return t;
  }

  function forecastSectionMonth(rows: SectionRowDef[], month: number): number {
    return rows.reduce((s, r) => s + forecastCell(r.key, month), 0);
  }

  function forecastSectionTotal(rows: SectionRowDef[]): number {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += forecastSectionMonth(rows, m);
    return t;
  }

  function forecastNetMonth(month: number): number {
    let rev = 0;
    let cost = 0;
    for (const sec of sectionDefs) {
      const v = forecastSectionMonth(sec.rows, month);
      if (sec.isRevenue) rev += v;
      else cost += v;
    }
    return rev - cost;
  }

  function forecastNetTotal(): number {
    let t = 0;
    for (let m = 1; m <= 12; m++) t += forecastNetMonth(m);
    return t;
  }

  // Summary card values
  const ytdRevenue = useMemo(() => {
    const revSections = sectionDefs.filter((s) => s.isRevenue);
    let t = 0;
    for (const sec of revSections) {
      for (const r of sec.rows) {
        for (let m = 1; m < CURRENT_MONTH; m++) {
          t += cellVal(actualsMap, r.key, m);
        }
      }
    }
    return t;
  }, [actualsMap, sectionDefs]);

  const projectedRevenue = useMemo(() => {
    const revSections = sectionDefs.filter((s) => s.isRevenue);
    let t = 0;
    for (const sec of revSections) {
      for (const r of sec.rows) t += forecastRowTotal(r.key);
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, actualsMap, sectionDefs]);

  const projectedNet = useMemo(() => forecastNetTotal(), [grid, actualsMap, sectionDefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const colSpan = 15; // category + 12 months + total

  function monthHeaderStyle(m: number): string {
    if (m < CURRENT_MONTH) return 'text-charcoal-brand/50';
    if (m === CURRENT_MONTH) return 'text-gold-brand font-semibold';
    return 'text-teal-brand';
  }

  function monthSubLabel(m: number): string {
    if (m < CURRENT_MONTH) return 'Actual';
    if (m === CURRENT_MONTH) return 'Now';
    return 'Budget';
  }

  function cellBg(m: number): string {
    if (m < CURRENT_MONTH) return 'bg-cream-brand';
    if (m === CURRENT_MONTH) return 'bg-gold-brand/10';
    return '';
  }

  return (
    <>
      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-charcoal-brand/10 bg-cream-brand p-4">
          <div className="mb-1 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-brand" />
            <span className="font-lato text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
              YTD Actual Revenue
            </span>
          </div>
          <p className="font-headline text-2xl font-bold text-teal-brand">
            {isLoading ? '...' : formatCurrency(ytdRevenue)}
          </p>
        </div>

        <div className="rounded-xl border border-charcoal-brand/10 bg-cream-brand p-4">
          <div className="mb-1 flex items-center gap-2">
            <Target className="h-5 w-5 text-gold-brand" />
            <span className="font-lato text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
              Projected Full Year Revenue
            </span>
          </div>
          <p className="font-headline text-2xl font-bold text-gold-brand">
            {isLoading ? '...' : formatCurrency(projectedRevenue)}
          </p>
        </div>

        <div className="rounded-xl border border-charcoal-brand/10 bg-cream-brand p-4">
          <div className="mb-1 flex items-center gap-2">
            <DollarSign className={`h-5 w-5 ${projectedNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`} />
            <span className="font-lato text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
              Projected Net Profit / (Loss)
            </span>
          </div>
          <p className={`font-headline text-2xl font-bold ${projectedNet >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {isLoading ? '...' : formatCurrency(projectedNet)}
          </p>
        </div>
      </div>

      {/* Forecast table */}
      <div className="overflow-x-auto rounded-lg border border-charcoal-brand/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-charcoal-brand/10">
              <th className="font-lato sticky left-0 z-10 min-w-[170px] bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                Category
              </th>
              {MONTHS.map((label, i) => {
                const m = i + 1;
                return (
                  <th key={i} className={`font-lato min-w-[76px] px-1.5 py-1 text-center text-xs font-semibold uppercase tracking-wide ${monthHeaderStyle(m)}`}>
                    <div>{label}</div>
                    <div className="text-[10px] font-normal normal-case tracking-normal opacity-70">
                      {monthSubLabel(m)}
                    </div>
                  </th>
                );
              })}
              <th className="font-lato min-w-[100px] bg-teal-brand/5 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-charcoal-brand/60">
                <div>Total</div>
                <div className="text-[10px] font-normal normal-case tracking-normal opacity-70">
                  Projected Full Year
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {sectionDefs.map((sec) => (
              <ForecastSection
                key={sec.key}
                section={sec}
                forecastCell={forecastCell}
                forecastRowTotal={forecastRowTotal}
                forecastSectionMonth={forecastSectionMonth}
                forecastSectionTotal={forecastSectionTotal}
                cellBg={cellBg}
                isLoading={isLoading}
                colSpan={colSpan}
              />
            ))}

            {/* Net position */}
            <tr className="bg-gold-brand/10">
              <td colSpan={colSpan} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
                Net Position
              </td>
            </tr>
            <tr className="border-t-2 border-charcoal-brand/20 bg-gold-brand/5">
              <td className="font-lato sticky left-0 z-10 bg-gold-brand/5 px-4 py-2 text-sm font-bold text-charcoal-brand">
                Net Profit / (Loss)
              </td>
              {MONTHS.map((_, i) => {
                const m = i + 1;
                const val = forecastNetMonth(m);
                const c = val >= 0 ? 'text-emerald-600' : 'text-red-500';
                return (
                  <td key={m} className={`font-lato px-1.5 py-2 text-right text-sm font-semibold tabular-nums ${c} ${cellBg(m)}`}>
                    {isLoading ? <PulseCell /> : formatCurrency(val)}
                  </td>
                );
              })}
              <td className={`font-lato bg-teal-brand/5 px-2 py-2 text-right text-sm font-bold tabular-nums ${forecastNetTotal() >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {isLoading ? <PulseCell /> : formatCurrency(forecastNetTotal())}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function ForecastSection({
  section,
  forecastCell,
  forecastRowTotal,
  forecastSectionMonth,
  forecastSectionTotal,
  cellBg,
  isLoading,
  colSpan,
}: {
  section: SectionDef;
  forecastCell: (key: string, month: number) => number;
  forecastRowTotal: (key: string) => number;
  forecastSectionMonth: (rows: SectionRowDef[], month: number) => number;
  forecastSectionTotal: (rows: SectionRowDef[]) => number;
  cellBg: (month: number) => string;
  isLoading: boolean;
  colSpan: number;
}) {
  const total = forecastSectionTotal(section.rows);

  return (
    <>
      <tr className="bg-teal-brand/10">
        <td colSpan={colSpan} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
          {section.label}
        </td>
      </tr>
      {section.rows.map((row) => {
        const rt = forecastRowTotal(row.key);
        return (
          <tr key={row.key} className="border-b border-charcoal-brand/5 transition-colors hover:bg-cream-brand/40">
            <td className="font-lato sticky left-0 z-10 bg-white px-4 py-1.5 text-sm text-charcoal-brand">
              {row.label}
            </td>
            {MONTHS.map((_, i) => {
              const m = i + 1;
              const val = forecastCell(row.key, m);
              return (
                <td key={m} className={`font-lato px-1.5 py-1.5 text-right text-sm tabular-nums text-charcoal-brand ${cellBg(m)}`}>
                  {isLoading ? <PulseCell /> : (val ? formatCurrency(val) : '\u2014')}
                </td>
              );
            })}
            <td className="font-lato bg-teal-brand/5 px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-charcoal-brand">
              {isLoading ? <PulseCell /> : (rt ? formatCurrency(rt) : '\u2014')}
            </td>
          </tr>
        );
      })}
      {/* Section subtotal */}
      <tr className="border-b border-charcoal-brand/10 bg-teal-brand/5">
        <td className="font-lato sticky left-0 z-10 bg-teal-brand/5 px-4 py-2 text-sm font-bold text-charcoal-brand">
          Total {section.label}
        </td>
        {MONTHS.map((_, i) => {
          const m = i + 1;
          const val = forecastSectionMonth(section.rows, m);
          return (
            <td key={m} className={`font-lato px-1.5 py-2 text-right text-sm font-semibold tabular-nums text-charcoal-brand ${cellBg(m)}`}>
              {isLoading ? <PulseCell /> : (val ? formatCurrency(val) : '\u2014')}
            </td>
          );
        })}
        <td className="font-lato bg-teal-brand/5 px-2 py-2 text-right text-sm font-bold tabular-nums text-charcoal-brand">
          {isLoading ? <PulseCell /> : (total ? formatCurrency(total) : '\u2014')}
        </td>
      </tr>
    </>
  );
}

// ════════════════════════════════════════════════════════════
// SHARED TABLE SUB-COMPONENTS
// ════════════════════════════════════════════════════════════

function SectionHeader({ label, colSpan }: { label: string; colSpan: number }) {
  return (
    <tr className="bg-teal-brand/10">
      <td colSpan={colSpan} className="font-headline px-4 py-2 text-sm font-bold text-teal-brand">
        {label}
      </td>
    </tr>
  );
}

function DataRow({
  row,
  grid,
  mobileMonth,
  onCellChange,
}: {
  row: RowDef;
  grid: BudgetGrid;
  mobileMonth: number;
  onCellChange: (key: string, month: number, value: string) => void;
}) {
  const key = gk(row.lineType, row.categoryLabel);
  const total = sumRow(grid, key);

  return (
    <tr className="border-b border-charcoal-brand/5 hover:bg-cream-brand/40 transition-colors">
      <td className="font-lato sticky left-0 z-10 bg-white px-4 py-1 text-sm text-charcoal-brand">
        {row.categoryLabel}
      </td>
      {MONTHS.map((_, i) => {
        const m = i + 1;
        const val = cellVal(grid, key, m);
        return (
          <td key={m} className={`px-1 py-1 ${m === mobileMonth ? '' : 'hidden'} md:table-cell`}>
            <input
              type="number"
              min={0}
              step={0.01}
              value={val || ''}
              onChange={(e) => onCellChange(key, m, e.target.value)}
              placeholder="0"
              className="font-lato w-full rounded border border-transparent bg-transparent px-2 py-1 text-right text-sm text-charcoal-brand focus:border-gold-brand focus:outline-none focus:ring-0"
            />
          </td>
        );
      })}
      <td className="font-lato bg-sand-brand/30 px-2 py-1 text-right text-sm font-semibold text-charcoal-brand">
        {total > 0 ? formatCurrency(total) : '\u2014'}
      </td>
    </tr>
  );
}

function SubtotalRow({
  label,
  grid,
  rows,
  mobileMonth,
}: {
  label: string;
  grid: BudgetGrid;
  rows: RowDef[];
  mobileMonth: number;
}) {
  const total = sumSectionTotal(grid, rows);

  return (
    <tr className="border-b border-charcoal-brand/10 bg-teal-brand/5">
      <td className="font-lato sticky left-0 z-10 bg-teal-brand/5 px-4 py-2 text-sm font-bold text-charcoal-brand">
        {label}
      </td>
      {MONTHS.map((_, i) => {
        const m = i + 1;
        const val = sumSection(grid, rows, m);
        return (
          <td
            key={m}
            className={`font-lato px-2 py-2 text-right text-sm font-semibold text-charcoal-brand ${
              m === mobileMonth ? '' : 'hidden'
            } md:table-cell`}
          >
            {val > 0 ? formatCurrency(val) : '\u2014'}
          </td>
        );
      })}
      <td className="font-lato bg-sand-brand/30 px-2 py-2 text-right text-sm font-bold text-charcoal-brand">
        {total > 0 ? formatCurrency(total) : '\u2014'}
      </td>
    </tr>
  );
}

function NetRow({
  netForMonth,
  netTotal,
  mobileMonth,
}: {
  netForMonth: (month: number) => number;
  netTotal: () => number;
  mobileMonth: number;
}) {
  const total = netTotal();
  const colorClass = total >= 0 ? 'text-teal-brand' : 'text-red-500';

  return (
    <tr className="border-b border-charcoal-brand/10 bg-gold-brand/5">
      <td className="font-lato sticky left-0 z-10 bg-gold-brand/5 px-4 py-2 text-sm font-bold text-charcoal-brand">
        Net Profit / (Loss)
      </td>
      {MONTHS.map((_, i) => {
        const m = i + 1;
        const val = netForMonth(m);
        const mc = val >= 0 ? 'text-teal-brand' : 'text-red-500';
        return (
          <td
            key={m}
            className={`font-lato px-2 py-2 text-right text-sm font-semibold ${mc} ${
              m === mobileMonth ? '' : 'hidden'
            } md:table-cell`}
          >
            {formatCurrency(val)}
          </td>
        );
      })}
      <td className={`font-lato bg-sand-brand/30 px-2 py-2 text-right text-sm font-bold ${colorClass}`}>
        {formatCurrency(total)}
      </td>
    </tr>
  );
}

function PulseCell() {
  return <div className="ml-auto h-4 w-16 animate-pulse rounded bg-sand-brand/60" />;
}

function VarianceArrow({ value }: { value: number }) {
  if (value > 0) return <ChevronUp className="h-3.5 w-3.5" />;
  if (value < 0) return <ChevronDown className="h-3.5 w-3.5" />;
  return null;
}
