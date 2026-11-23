import type { TimesheetRepository } from '@lolas/domain';

export interface ApproveTimesheetsInput {
  timesheetIds: string[];
  /** Rows the approver confirmed after seeing their rota flags. */
  acknowledgedIds?: string[];
}

export interface ApproveTimesheetsResult {
  approved: number;
  acknowledged: number;
}

export interface ApproveTimesheetsDeps {
  timesheets: TimesheetRepository;
  /** Ids among these with rota warnings that nobody has acknowledged yet. */
  unacknowledgedFlagged?: (ids: string[]) => Promise<string[]>;
  acknowledge?: (ids: string[]) => Promise<void>;
}

export async function approveTimesheets(
  input: ApproveTimesheetsInput,
  deps: ApproveTimesheetsDeps,
): Promise<ApproveTimesheetsResult> {
  if (input.timesheetIds.length === 0) {
    return { approved: 0, acknowledged: 0 };
  }

  const flagged = deps.unacknowledgedFlagged ? await deps.unacknowledgedFlagged(input.timesheetIds) : [];
  const acked = new Set(input.acknowledgedIds ?? []);
  const missing = flagged.filter((id) => !acked.has(id));
  if (missing.length > 0) {
    throw Object.assign(
      new Error(`${missing.length} timesheet${missing.length === 1 ? ' doesn’t' : 's don’t'} match the rota. Check and confirm ${missing.length === 1 ? 'it' : 'them'} before approving.`),
      { statusCode: 409, code: 'ROTA_CHECK_REQUIRED', timesheetIds: missing },
    );
  }
  const toAcknowledge = flagged.filter((id) => acked.has(id));
  if (toAcknowledge.length > 0 && deps.acknowledge) await deps.acknowledge(toAcknowledge);

  await deps.timesheets.bulkUpdateStatus(input.timesheetIds, 'Approved');

  return { approved: input.timesheetIds.length, acknowledged: toAcknowledge.length };
}
