import { DomainError } from '@lolas/domain';
import type { SaveWorkUpdateRequest } from '@lolas/shared';
import { getSupabaseClient } from '../../adapters/supabase/client.js';
import { formatManilaDate } from '../../utils/manila-date.js';

type Row = Record<string, unknown>;

export interface WorkUpdateRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  weekStart: string;
  workedOn: string;
  results: string | null;
  nextWeek: string | null;
  blockers: string | null;
  submittedAt: string;
  updatedAt: string;
  managerComment: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
}

const sb = () => getSupabaseClient();
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));
const opt = (v: string | undefined): string | null => (v?.trim() ? v.trim() : null);

/** Monday of the week containing the date. */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const offset = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - offset);
  return dt.toISOString().slice(0, 10);
}

async function namesFor(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const { data } = await sb().from('employees').select('id, full_name').in('id', unique);
  for (const e of (data ?? []) as Row[]) out.set(String(e.id), String(e.full_name ?? ''));
  return out;
}

function toRecord(r: Row, names: Map<string, string>): WorkUpdateRecord {
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    employeeName: names.get(String(r.employee_id)) ?? '',
    storeId: String(r.store_id),
    weekStart: String(r.week_start),
    workedOn: String(r.worked_on),
    results: s(r.results),
    nextWeek: s(r.next_week),
    blockers: s(r.blockers),
    submittedAt: String(r.submitted_at),
    updatedAt: String(r.updated_at),
    managerComment: s(r.manager_comment),
    reviewedByName: r.reviewed_by ? names.get(String(r.reviewed_by)) ?? null : null,
    reviewedAt: s(r.reviewed_at),
  };
}

export async function listWorkUpdates(filter: { employeeId?: string; storeId?: string; limit?: number }): Promise<WorkUpdateRecord[]> {
  let q = sb().from('work_updates').select('*').order('week_start', { ascending: false }).order('submitted_at', { ascending: false })
    .limit(filter.limit ?? 200);
  if (filter.employeeId) q = q.eq('employee_id', filter.employeeId);
  if (filter.storeId) q = q.eq('store_id', filter.storeId);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to load work updates: ${error.message}`);
  const rows = (data ?? []) as Row[];
  const names = await namesFor(rows.flatMap((r) => [s(r.employee_id), s(r.reviewed_by)]));
  return rows.map((r) => toRecord(r, names));
}

/** One update per week; it can be edited until a manager has commented on it. */
export async function saveMyWorkUpdate(employeeId: string, input: SaveWorkUpdateRequest): Promise<WorkUpdateRecord> {
  const weekStart = weekStartOf(input.weekStart);
  if (weekStart > weekStartOf(formatManilaDate())) throw new DomainError('You can’t send an update for a future week');

  const { data: emp, error: eErr } = await sb().from('employees').select('store_id').eq('id', employeeId).maybeSingle();
  if (eErr) throw new Error(`Failed to load employee: ${eErr.message}`);
  if (!emp?.store_id) throw new DomainError('Your profile has no store; ask a manager to set one');

  const { data: existing, error: xErr } = await sb().from('work_updates').select('id, reviewed_at')
    .eq('employee_id', employeeId).eq('week_start', weekStart).maybeSingle();
  if (xErr) throw new Error(`Failed to load work update: ${xErr.message}`);
  if (existing?.reviewed_at) throw new DomainError('Your manager has already replied to this update, so it can’t be changed');

  const fields = {
    worked_on: input.workedOn.trim(),
    results: opt(input.results),
    next_week: opt(input.nextWeek),
    blockers: opt(input.blockers),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = existing
    ? await sb().from('work_updates').update(fields).eq('id', existing.id).select('*').single()
    : await sb().from('work_updates').insert({ ...fields, employee_id: employeeId, store_id: String(emp.store_id), week_start: weekStart })
        .select('*').single();
  if (error) throw new Error(`Failed to save work update: ${error.message}`);
  return toRecord(data as Row, await namesFor([employeeId]));
}

export async function commentOnWorkUpdate(id: string, reviewerId: string, comment: string): Promise<void> {
  const { data: row, error: rErr } = await sb().from('work_updates').select('employee_id').eq('id', id).maybeSingle();
  if (rErr) throw new Error(`Failed to load work update: ${rErr.message}`);
  if (!row) throw new DomainError('Work update not found');
  if (String(row.employee_id) === reviewerId) throw new DomainError('You can’t reply to your own update');
  const { error } = await sb().from('work_updates').update({
    manager_comment: comment.trim(),
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw new Error(`Failed to save comment: ${error.message}`);
}
