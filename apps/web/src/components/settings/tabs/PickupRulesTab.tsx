import { usePickupRules, type PickupRuleRow } from '../../../api/config.js';

/** Formats a Postgres time string ("HH:MM:SS" or "HH:MM") as "HH:MM". */
function toHHMM(t: string | null): string {
  if (!t) return '—';
  return t.slice(0, 5);
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

export function PickupRulesTab() {
  const { data, isLoading } = usePickupRules();
  const rows = (data ?? []) as PickupRuleRow[];

  const bracketRows = rows
    .filter((r) => r.vehicle_type === 'shared_van' && r.rule_type === 'bracket')
    .sort((a, b) => (a.flight_hour ?? 0) - (b.flight_hour ?? 0));

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading pickup rules…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Pickup Time Rules</h2>
        <p className="mt-1 text-sm text-gray-500">
          Read-only. Rules are managed via database migration. All times are in PHT (Asia/Manila).
        </p>
      </div>

      {/* Inbound */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Inbound (IAO → General Luna)
        </h3>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Pickup time = exact flight arrival time. The driver meets the customer at IAO
          Arrivals Hall — no offset applied.
        </div>
      </section>

      {/* Shared Van */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Outbound — Shared Van (General Luna → IAO)
        </h3>
        <p className="mb-3 text-sm text-gray-500">
          The flight departure hour is floored (minutes ignored). A 6:50 AM flight is
          treated as a 6 AM flight and maps to the 6 AM row below.
        </p>
        {bracketRows.length === 0 ? (
          <p className="text-sm text-gray-400 italic">No bracket rules found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Flight hour (floored)
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Pickup window
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {bracketRows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-gray-700">
                      {r.flight_hour != null ? hourLabel(r.flight_hour) : '—'}
                    </td>
                    <td className="px-4 py-2 font-medium text-gray-900">
                      {toHHMM(r.pickup_from)}
                      {r.pickup_to ? `–${toHHMM(r.pickup_to)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Private Van & Tuktuk */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Outbound — Private Van &amp; Tuk-tuk (General Luna → IAO)
        </h3>
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Pickup time = flight departure time − 90 minutes. Single time, no window.
        </div>
      </section>
    </div>
  );
}
