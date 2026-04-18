import type { Timesheet } from '../entities/timesheet.js';
import type { Period } from '../value-objects/period.js';

export interface TimesheetRepository {
  findByPeriod(storeId: string | undefined, period: Period): Promise<Timesheet[]>;
  findByEmployee(employeeId: string, period: Period): Promise<Timesheet[]>;
  save(timesheet: Timesheet): Promise<void>;
  saveMany(timesheets: Timesheet[]): Promise<void>;
  bulkUpdateStatus(
    ids: string[],
    status: 'Pending' | 'Approved' | 'Paid',
  ): Promise<void>;
  runPayrollAtomic(
    transactions: Array<{
      transactionId: string;
      period: string;
      date: string;
      storeId: string;
      legs: Array<{
        id: string;
        account_id: string;
        debit: number;
        credit: number;
        description: string;
        reference_type: string;
        reference_id: string | null;
      }>;
    }>,
    timesheetIds: string[],
    status: string,
    // Idempotency key: the header row written by run_payroll_atomic is
    // UNIQUE on (storeId, periodStart, periodEnd). A repeat call with the
    // same triple rejects with SQLSTATE 23505 (unique_violation).
    storeId: string,
    periodStart: string,
    periodEnd: string,
    runBy: string | null,
  ): Promise<void>;
}
