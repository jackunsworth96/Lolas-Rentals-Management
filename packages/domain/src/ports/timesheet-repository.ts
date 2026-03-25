import type { Timesheet } from '../entities/timesheet.js';
import type { Period } from '../value-objects/period.js';

export interface TimesheetRepository {
  findByPeriod(storeId: string, period: Period): Promise<Timesheet[]>;
  findByEmployee(employeeId: string, period: Period): Promise<Timesheet[]>;
  save(timesheet: Timesheet): Promise<void>;
  saveMany(timesheets: Timesheet[]): Promise<void>;
  bulkUpdateStatus(
    ids: string[],
    status: 'Pending' | 'Approved' | 'Paid',
  ): Promise<void>;
}
