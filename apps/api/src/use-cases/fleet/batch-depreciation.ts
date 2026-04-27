import {
  type FleetRepository,
  calculateMonthlyDepreciation,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

export interface BatchDepreciationDeps {
  fleetRepo: FleetRepository;
}

export interface BatchDepreciationInput {
  /**
   * `'all'` runs the batch across every store and posts the journal under
   * `store_id = 'company'`. A specific store id runs only that store and
   * posts the journal under that same store.
   */
  storeId: string;
  /** YYYY-MM — used both as the journal `period` and `reference_id`. */
  period: string;
  depreciationExpenseAccountId: string;
  accDepreciationAccountId: string;
}

export interface DepreciationEntry {
  vehicleId: string;
  vehicleName: string;
  amount: number;
  newBookValue: number;
  newAccumulatedDepreciation: number;
}

interface VehicleRecord {
  vehicle_id: string;
  new_accumulated_depreciation: number;
  new_book_value: number;
  depreciation_amount: number;
}

interface PostBatchDepreciationResult {
  transaction_id: string;
  debit_entry_id: string;
  credit_entry_id: string;
  vehicle_count: number;
  total_depreciation: number;
}

export async function batchDepreciation(
  deps: BatchDepreciationDeps,
  input: BatchDepreciationInput,
) {
  const { fleetRepo } = deps;
  const {
    storeId,
    period,
    depreciationExpenseAccountId,
    accDepreciationAccountId,
  } = input;

  // ── Input validation ─────────────────────────────────────────────────────
  if (!storeId) {
    throw new Error('batchDepreciation: storeId is required ("all" or a specific store id)');
  }
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(`batchDepreciation: period must be YYYY-MM, got "${period}"`);
  }
  if (!depreciationExpenseAccountId) {
    throw new Error('batchDepreciation: depreciationExpenseAccountId is required');
  }
  if (!accDepreciationAccountId) {
    throw new Error('batchDepreciation: accDepreciationAccountId is required');
  }

  // "all" → cross-store batch posted to the company-level store row.
  const isAllStores = storeId === 'all';
  const postingStoreId = isAllStores ? 'company' : storeId;

  const vehicles = isAllStores
    ? await fleetRepo.findAll()
    : await fleetRepo.findByStore(storeId);

  // ── Build the per-vehicle depreciation records ──────────────────────────
  // Eligibility checks preserved verbatim from the previous implementation.
  // Domain math comes from packages/domain depreciation-service (untouched).
  const entries: DepreciationEntry[] = [];
  const records: VehicleRecord[] = [];
  let totalDepreciation = 0;

  for (const vehicle of vehicles) {
    if (vehicle.isProtected()) continue;
    if (!vehicle.usefulLifeMonths || vehicle.usefulLifeMonths <= 0) continue;
    if (vehicle.bookValue <= vehicle.salvageValue) continue;

    const result = calculateMonthlyDepreciation({
      totalCost: vehicle.totalBikeCost,
      salvageValue: vehicle.salvageValue,
      usefulLifeMonths: vehicle.usefulLifeMonths,
      accumulatedDepreciation: vehicle.accumulatedDepreciation,
      bookValue: vehicle.bookValue,
    });

    if (result.actualDepreciation <= 0) continue;

    records.push({
      vehicle_id: vehicle.id,
      new_accumulated_depreciation: result.newAccumulatedDepreciation,
      new_book_value: result.newBookValue,
      depreciation_amount: result.actualDepreciation,
    });

    entries.push({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      amount: result.actualDepreciation,
      newBookValue: result.newBookValue,
      newAccumulatedDepreciation: result.newAccumulatedDepreciation,
    });

    totalDepreciation += result.actualDepreciation;
  }

  // Nothing eligible → no DB writes, no journal.
  if (records.length === 0 || totalDepreciation <= 0) {
    return {
      entries,
      totalDepreciation: 0,
      vehicleCount: 0,
      transactionId: null,
    };
  }

  // ── Single atomic RPC: fleet UPDATEs + journal INSERTs in one tx ────────
  const journalEntryDate = formatManilaDate();

  const { data: rpcData, error: rpcErr } = await supabase.rpc('post_batch_depreciation', {
    p_vehicle_records:                  records,
    p_journal_entry_date:               journalEntryDate,
    p_store_id:                         postingStoreId,
    p_period:                           period,
    p_depreciation_expense_account_id:  depreciationExpenseAccountId,
    p_acc_depreciation_account_id:      accDepreciationAccountId,
  });

  if (rpcErr) {
    throw new Error(`post_batch_depreciation RPC failed: ${rpcErr.message}`);
  }

  const result = rpcData as PostBatchDepreciationResult | null;

  return {
    entries,
    totalDepreciation,
    vehicleCount: entries.length,
    transactionId: result?.transaction_id ?? null,
  };
}
