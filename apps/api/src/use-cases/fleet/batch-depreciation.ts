import {
  type FleetRepository,
  calculateMonthlyDepreciation,
} from '@lolas/domain';
import { supabase } from '../../adapters/supabase/client.js';

export interface BatchDepreciationDeps {
  fleetRepo: FleetRepository;
}

export interface BatchDepreciationInput {
  /** An individual store id. Cross-store runs are intentionally unsupported. */
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

export interface SkippedDepreciationVehicle {
  vehicleId: string;
  vehicleName: string;
  reason: string;
}

interface VehicleRecord {
  vehicle_id: string;
  new_accumulated_depreciation: number;
  new_book_value: number;
  depreciation_amount: number;
}

interface PostBatchDepreciationResult {
  run_id: string;
  transaction_id: string;
  debit_entry_id: string;
  credit_entry_id: string;
  vehicle_count: number;
  total_depreciation: number;
  already_posted: boolean;
}

function periodEndDate(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month || month < 1 || month > 12) {
    throw new Error(`batchDepreciation: period must be YYYY-MM, got "${period}"`);
  }
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${period}-${String(day).padStart(2, '0')}`;
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
    throw new Error('batchDepreciation: an individual store id is required');
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

  if (storeId === 'all') {
    throw new Error('batchDepreciation: an individual store id is required');
  }

  const vehicles = await fleetRepo.findByStore(storeId);

  // ── Build the per-vehicle depreciation records ──────────────────────────
  // Missing accounting data is surfaced to the caller for human review.
  const entries: DepreciationEntry[] = [];
  const skippedVehicles: SkippedDepreciationVehicle[] = [];
  const records: VehicleRecord[] = [];
  let totalDepreciation = 0;

  for (const vehicle of vehicles) {
    if (vehicle.isProtected()) continue;
    if (vehicle.purchasePrice == null) {
      skippedVehicles.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, reason: 'missing purchase price' });
      continue;
    }
    if (!vehicle.purchaseDate) {
      skippedVehicles.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, reason: 'missing purchase date' });
      continue;
    }
    if (vehicle.purchaseDate.slice(0, 7) > period) continue;
    if (!vehicle.usefulLifeMonths || vehicle.usefulLifeMonths <= 0) {
      skippedVehicles.push({ vehicleId: vehicle.id, vehicleName: vehicle.name, reason: 'missing useful life' });
      continue;
    }
    if (vehicle.bookValue <= vehicle.salvageValue) continue;

    const result = calculateMonthlyDepreciation({
      purchasePrice: vehicle.purchasePrice,
      salvageValue: vehicle.salvageValue,
      usefulLifeMonths: vehicle.usefulLifeMonths,
      accumulatedDepreciation: vehicle.accumulatedDepreciation,
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
      skippedVehicles,
      totalDepreciation: 0,
      vehicleCount: 0,
      transactionId: null,
      runId: null,
      status: 'nothing_to_post' as const,
    };
  }

  // ── Single atomic RPC: fleet UPDATEs + journal INSERTs in one tx ────────
  const journalEntryDate = periodEndDate(period);

  const { data: rpcData, error: rpcErr } = await supabase.rpc('post_batch_depreciation', {
    p_vehicle_records:                  records,
    p_journal_entry_date:               journalEntryDate,
    p_store_id:                         storeId,
    p_period:                           period,
    p_depreciation_expense_account_id:  depreciationExpenseAccountId,
    p_acc_depreciation_account_id:      accDepreciationAccountId,
  });

  if (rpcErr) {
    throw new Error(`post_batch_depreciation RPC failed: ${rpcErr.message}`);
  }

  const result = rpcData as PostBatchDepreciationResult | null;

  if (result?.already_posted) {
    return {
      entries: [],
      skippedVehicles,
      totalDepreciation: Number(result.total_depreciation),
      vehicleCount: result.vehicle_count,
      transactionId: result.transaction_id,
      runId: result.run_id,
      status: 'already_posted' as const,
    };
  }

  return {
    entries,
    skippedVehicles,
    totalDepreciation,
    vehicleCount: entries.length,
    transactionId: result?.transaction_id ?? null,
    runId: result?.run_id ?? null,
    status: 'posted' as const,
  };
}
