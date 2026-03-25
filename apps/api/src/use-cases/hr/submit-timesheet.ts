import {
  Timesheet,
  type TimesheetProps,
  type TimesheetRepository,
} from '@lolas/domain';
import { randomUUID } from 'node:crypto';

export interface TimesheetEntryInput {
  date: string;
  employeeId: string;
  name: string | null;
  dayType: string;
  timeIn: string | null;
  timeOut: string | null;
  ninePmReturnsCount: number;
  dailyNotes: string | null;
  silInflation: number;
  storeId: string;
}

export interface SubmitTimesheetInput {
  entries: TimesheetEntryInput[];
}

export interface SubmitTimesheetResult {
  created: number;
  timesheetIds: string[];
}

export async function submitTimesheet(
  input: SubmitTimesheetInput,
  deps: { timesheets: TimesheetRepository },
): Promise<SubmitTimesheetResult> {
  const timesheets: Timesheet[] = input.entries.map((entry) => {
    let regularHours = 0;
    let overtimeHours = 0;

    if (entry.timeIn && entry.timeOut) {
      const hours = Timesheet.calculateHours(entry.timeIn, entry.timeOut);
      regularHours = hours.regularHours;
      overtimeHours = hours.overtimeHours;
    }

    const props: TimesheetProps = {
      id: randomUUID(),
      date: entry.date,
      employeeId: entry.employeeId,
      name: entry.name,
      dayType: entry.dayType,
      timeIn: entry.timeIn,
      timeOut: entry.timeOut,
      regularHours,
      overtimeHours,
      ninePmReturnsCount: entry.ninePmReturnsCount,
      dailyNotes: entry.dailyNotes,
      payrollStatus: 'Pending',
      silInflation: entry.silInflation,
      storeId: entry.storeId,
      createdAt: new Date(),
    };

    return Timesheet.create(props);
  });

  await deps.timesheets.saveMany(timesheets);

  return {
    created: timesheets.length,
    timesheetIds: timesheets.map((t) => t.id),
  };
}
