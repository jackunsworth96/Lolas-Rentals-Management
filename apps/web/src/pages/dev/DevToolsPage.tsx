import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client.js';

interface ResetSummary {
  waiver_reminder_log: number;
  post_rental_email_log: number;
  inspections: number;
  vehicle_swaps: number;
  maya_checkouts: number;
  card_settlements: number;
  payments: number;
  journal_entries: number;
  transfers: number;
  orders: number;
  orders_raw: number;
  waivers: number;
  booking_holds: number;
  cash_reconciliation: number;
  lost_opportunity: number;
  fleet_reset: number;
}

const CONFIRM_WORD = 'RESET';

const WHAT_IS_WIPED = [
  'All orders (active, completed, inbox)',
  'All payments and card settlements',
  'All journal / accounting entries',
  'All airport transfers',
  'All waivers and booking holds',
  'All cashup records',
  'All lost opportunity records',
  'Vehicle inspection records',
  'Fleet statuses reset to Available (sold / service vehicles unchanged)',
];

const WHAT_IS_KEPT = [
  'Stores, staff, and user accounts',
  'Fleet inventory (vehicles themselves)',
  'Vehicle models and locations',
  'Chart of accounts',
  'Add-ons, pricing, and payment methods',
  'Inspection item templates',
  'Customer contact records',
  'Expenses and maintenance records',
  'Timesheets and payroll records',
];

const CUSTOMER_MESSAGE_JOBS = [
  { id: 'pickup_reminder_tomorrow', label: 'Pickup tomorrow' },
  { id: 'return_reminder_tomorrow', label: 'Return tomorrow' },
  { id: 'return_reminder_today', label: 'Return today' },
  { id: 'post_rental_review', label: 'Post-rental review' },
] as const;

export default function DevToolsPage() {
  const [confirmText, setConfirmText] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [summary, setSummary] = useState<ResetSummary | null>(null);
  const [selectedJob, setSelectedJob] = useState<(typeof CUSTOMER_MESSAGE_JOBS)[number]['id']>('pickup_reminder_tomorrow');
  const [jobResult, setJobResult] = useState<string | null>(null);

  const resetMutation = useMutation({
    mutationFn: () => api.post<{ data: ResetSummary }>('/dev-tools/reset', {}),
    onSuccess: (res) => {
      setSummary((res as unknown as { data: ResetSummary }).data);
      setConfirmText('');
      setUnderstood(false);
    },
  });

  const canReset = confirmText === CONFIRM_WORD && understood && !resetMutation.isPending;

  const runCustomerMessageJob = useMutation({
    mutationFn: () => api.post<{ job: string; simulated: boolean }>('/dev-tools/run-customer-message-job', { job: selectedJob }),
    onSuccess: (res) => {
      const data = res as unknown as { job: string; simulated: boolean };
      setJobResult(`${data.job} completed${data.simulated ? ' in simulated mode' : ''}.`);
    },
  });

  function handleReset() {
    if (!canReset) return;
    resetMutation.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dev Tools</h1>
        <p className="mt-1 text-sm text-gray-500">
          Admin-only utilities for managing test data. These actions are
          irreversible — use only in a test / staging context.
        </p>
      </div>

      {/* Reset card */}
      <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 text-xl font-bold">
            ⚠
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-800">Reset Test Data</h2>
            <p className="mt-1 text-sm text-red-700">
              Permanently deletes all booking and operational test data and
              resets fleet statuses. This cannot be undone.
            </p>
          </div>
        </div>

        {/* What is wiped / kept */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-red-100 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-red-700">
              Will be wiped
            </p>
            <ul className="space-y-1">
              {WHAT_IS_WIPED.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-sm text-red-800">
                  <span className="mt-0.5 shrink-0 text-red-500">✕</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-green-700">
              Will be kept
            </p>
            <ul className="space-y-1">
              {WHAT_IS_KEPT.map((item) => (
                <li key={item} className="flex items-start gap-1.5 text-sm text-green-800">
                  <span className="mt-0.5 shrink-0 text-green-500">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Confirmation */}
        <div className="mt-6 space-y-4 rounded-lg bg-white p-4 border border-red-200">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-red-600"
            />
            <span className="text-sm text-gray-700">
              I understand this will <strong>permanently delete</strong> all test booking
              data and cannot be reversed.
            </span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type <span className="font-mono font-bold text-red-600">{CONFIRM_WORD}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder={CONFIRM_WORD}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
            />
          </div>

          <button
            onClick={handleReset}
            disabled={!canReset}
            className="w-full rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40 transition"
          >
            {resetMutation.isPending ? 'Resetting…' : 'Reset Test Data'}
          </button>

          {resetMutation.isError && (
            <p className="text-sm text-red-600">
              Reset failed: {(resetMutation.error as Error).message}
            </p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-bold text-gray-900">Customer Message Jobs</h2>
        <p className="mt-1 text-sm text-gray-500">
          Runs the scheduled job code manually. Available only outside production.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <select
            value={selectedJob}
            onChange={(e) => {
              setSelectedJob(e.target.value as typeof selectedJob);
              setJobResult(null);
            }}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
          >
            {CUSTOMER_MESSAGE_JOBS.map((job) => (
              <option key={job.id} value={job.id}>{job.label}</option>
            ))}
          </select>
          <button
            onClick={() => runCustomerMessageJob.mutate()}
            disabled={runCustomerMessageJob.isPending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {runCustomerMessageJob.isPending ? 'Running...' : 'Run Job'}
          </button>
        </div>

        {jobResult && (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{jobResult}</p>
        )}
        {runCustomerMessageJob.isError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            Job failed: {(runCustomerMessageJob.error as Error).message}
          </p>
        )}
      </div>

      {/* Success summary */}
      {summary && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6">
          <h3 className="text-base font-bold text-green-800 mb-4">✓ Reset complete</h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            {Object.entries(summary).map(([key, count]) => (
              <div key={key} className="flex justify-between">
                <span className="text-gray-600 font-mono text-xs">{key.replace(/_/g, ' ')}</span>
                <span className={`font-semibold tabular-nums ${count > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                  {key === 'fleet_reset' ? `${count} reset` : `${count} deleted`}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-green-700">
            Fleet statuses have been reset. You can now begin fresh test bookings.
          </p>
        </div>
      )}
    </div>
  );
}
