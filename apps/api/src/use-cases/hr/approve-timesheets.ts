import type { TimesheetRepository } from '@lolas/domain';

export interface ApproveTimesheetsInput {
  timesheetIds: string[];
}

export interface ApproveTimesheetsResult {
  approved: number;
}

export async function approveTimesheets(
  input: ApproveTimesheetsInput,
  deps: { timesheets: TimesheetRepository },
): Promise<ApproveTimesheetsResult> {
  if (input.timesheetIds.length === 0) {
    return { approved: 0 };
  }

  await deps.timesheets.bulkUpdateStatus(input.timesheetIds, 'Approved');

  return { approved: input.timesheetIds.length };
}
