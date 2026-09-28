import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { useAuthStore } from '../../stores/auth-store.js';

type Tier = { name: string; qty: number; startMonth: number; endMonth: number };
interface Config {
  tiers: Array<{ vehicle_type: string; tier_name: string; qty: number; start_month: number; end_month: number }>;
  baselines: Array<{ vehicle_type: string; effective_month: string; scheduled_qty: number }>;
  overrides: Array<{ id: string; vehicle_type: string; starts_on: string; ends_before: string; qty: number; reason: string }>;
  settings: { enabled: boolean } | null;
  shortfall: { message: string; detected_at: string } | null;
  models: Array<{ vehicle_models: { id: string; name: string; type: string | null } | null }>;
}
interface Report { underutilized: boolean; months: Array<{ month: string; allocatedHours: number; guaranteedHours: number; overflowHours: number; utilization: number | null }>; days: Array<{ date: string; allocatedHours: number; guaranteedHours: number; overflowHours: number; utilization: number | null }> }
const today = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const nextDay = (value: string, offset = 1) => new Date(Date.parse(`${value}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);
const inputClass = 'rounded border border-gray-300 px-2 py-1.5 text-sm w-full';
const buttonClass = 'rounded bg-teal-700 px-3 py-2 text-sm text-white disabled:opacity-50';
export function PartnerAllocations({ partnerId }: { partnerId: string }) {
  const client = useQueryClient();
  const canEdit = useAuthStore((s) => s.hasPermission('can_edit_settings'));
  const [vehicleType, setVehicleType] = useState('bike');
  const [month, setMonth] = useState(today().slice(0, 7));
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [override, setOverride] = useState({ startsOn: today(), endsOn: today(), qty: 0, reason: '' });
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [ready, setReady] = useState(false);
  const endpoint = `/partner-allocations/${partnerId}`;
  const config = useQuery({ queryKey: ['partner-allocations', partnerId], queryFn: () => api.get<Config>(endpoint) });
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1)).toISOString().slice(0, 10);
  const report = useQuery({ queryKey: ['partner-allocation-report', partnerId, vehicleType, month], queryFn: () => api.get<Report>(`${endpoint}/utilization?vehicleType=${vehicleType}&from=${month}-01&to=${monthEnd}`) });
  const data = config.data;
  const rows: Tier[] = tiers ?? data?.tiers.filter((t) => t.vehicle_type === vehicleType).map((t) => ({ name: t.tier_name, qty: t.qty, startMonth: t.start_month, endMonth: t.end_month })) ?? [];
  async function save(action: string, value: unknown) {
    setBusy(true); setMessage('');
    try {
      const result = await api.post<{ ready?: boolean; reservations?: number }>(endpoint, { action, data: value });
      setReady(action === 'preview' && !!result.ready);
      setMessage(action === 'preview' ? `Preview passed: ${result.reservations} existing reservations. Activation will check again.` : 'Saved.');
      await client.invalidateQueries({ queryKey: ['partner-allocations'] });
      await client.invalidateQueries({ queryKey: ['partner-allocation-report'] });
    } catch (err) { setReady(false); setMessage((err as Error).message); }
    finally { setBusy(false); }
  }
  if (config.isLoading) return <p>Loading partner allocations…</p>;
  if (config.error) return <p role="alert">{config.error.message}</p>;
  const baseline = data?.baselines.find((b) => b.vehicle_type === vehicleType && b.effective_month.slice(0, 7) === today().slice(0, 7));
  const activeOverride = data?.overrides.find((o) => o.vehicle_type === vehicleType && o.starts_on <= today() && o.ends_before > today());
  const models = [...new Map(data?.models.flatMap((m) => m.vehicle_models ? [[m.vehicle_models.id, m.vehicle_models] as const] : [])).values()];
  return <section className="rounded-xl border border-gray-200 p-4 space-y-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Protected allocations</h3><span className="text-sm">{data?.settings?.enabled ? 'Enabled for this store' : 'Not enabled for this store'}</span></div>
    {data?.shortfall && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-900">Fleet capacity shortfall: {data.shortfall.message}</p>}
    <label className="block text-sm">Vehicle type<select className={inputClass} value={vehicleType} onChange={(e) => { setVehicleType(e.target.value); setTiers(null); setReady(false); }}><option value="bike">Bike</option><option value="tuktuk">Tuktuk</option></select></label>
    <p className="text-sm">Today’s scheduled quantity: {baseline?.scheduled_qty ?? 0}. Current quantity: {activeOverride?.qty ?? baseline?.scheduled_qty ?? 0}.{activeOverride && ` Reason: ${activeOverride.reason}`}</p>
    <fieldset disabled={!canEdit || busy} className="space-y-3">
      <legend className="font-medium text-sm">Seasonal schedule</legend>
      <p className="text-xs text-gray-500">Cover all 12 months exactly once. October to April can be one range; May and September need separate rows. Existing schedules change from next month. Use an override for this month.</p>
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Season</th><th>From month</th><th>To month</th><th>Quantity</th><th /></tr></thead><tbody>{rows.map((row, i) => <tr key={i}>
        <td><input aria-label={`Season ${i + 1}`} className={inputClass} value={row.name} onChange={(e) => setTiers(rows.map((r, n) => n === i ? { ...r, name: e.target.value } : r))} /></td>
        {(['startMonth', 'endMonth', 'qty'] as const).map((key) => <td key={key}><input aria-label={`${row.name || 'Season'} ${key}`} className={inputClass} type="number" min={key === 'qty' ? 0 : 1} max={key === 'qty' ? 10000 : 12} value={row[key]} onChange={(e) => setTiers(rows.map((r, n) => n === i ? { ...r, [key]: Number(e.target.value) } : r))} /></td>)}
        <td><button type="button" aria-label={`Remove season ${i + 1}`} onClick={() => setTiers(rows.filter((_, n) => n !== i))}>Remove</button></td>
      </tr>)}</tbody></table></div>
      <div className="flex gap-2"><button type="button" className="text-sm underline" onClick={() => setTiers([...rows, { name: '', qty: 0, startMonth: 1, endMonth: 12 }])}>Add season</button><button type="button" className={buttonClass} disabled={!rows.length} onClick={() => save('tiers', { vehicleType, tiers: rows })}>Save schedule</button></div>
      <details><summary className="cursor-pointer text-sm">Vehicle classifications</summary><div className="space-y-2 pt-2">{models.map((m) => <label key={m.id} className="flex items-center justify-between gap-2 text-sm">{m.name}<select aria-label={`${m.name} type`} className="rounded border p-1" value={m.type ?? ''} disabled={!!data?.settings?.enabled && ['scooter', 'bike', 'motorcycle', 'tuktuk'].includes(m.type ?? '')} onChange={(e) => save('classify', { modelId: m.id, modelType: e.target.value })}><option value="" disabled>Unclassified</option><option value="scooter">Scooter / bike</option><option value="bike">Bike</option><option value="motorcycle">Motorcycle / bike</option><option value="tuktuk">Tuktuk</option></select></label>)}</div></details>
    </fieldset>
    <form className="space-y-2 border-t pt-3" onSubmit={(e) => { e.preventDefault(); void save('override', { vehicleType, startsOn: override.startsOn, endsBefore: nextDay(override.endsOn), qty: override.qty, reason: override.reason }); }}>
      <fieldset disabled={!canEdit || busy} className="space-y-2"><legend className="font-medium text-sm">Temporary override</legend><div className="grid grid-cols-3 gap-2">
        <label className="text-sm">Start<input required type="date" min={today()} className={inputClass} value={override.startsOn} onChange={(e) => setOverride({ ...override, startsOn: e.target.value })} /></label>
        <label className="text-sm">Last day<input required type="date" min={override.startsOn} className={inputClass} value={override.endsOn} onChange={(e) => setOverride({ ...override, endsOn: e.target.value })} /></label>
        <label className="text-sm">Quantity<input required type="number" min="0" max="10000" className={inputClass} value={override.qty} onChange={(e) => setOverride({ ...override, qty: Number(e.target.value) })} /></label>
      </div><label className="block text-sm">Reason<input required maxLength={1000} className={inputClass} value={override.reason} onChange={(e) => setOverride({ ...override, reason: e.target.value })} /></label><button className={buttonClass}>Save override</button></fieldset>
    </form>
    {data?.overrides.filter((o) => o.vehicle_type === vehicleType).map((o) => <div key={o.id} className="text-sm">{o.starts_on} to {nextDay(o.ends_before, -1)}: {o.qty} vehicles. {o.reason} {o.starts_on > today() && canEdit && <button disabled={busy} className="underline" onClick={() => save('revoke', { id: o.id })}>Remove future override</button>}</div>)}
    {!data?.settings?.enabled && canEdit && <div className="border-t pt-3 space-y-2"><p className="text-sm">Activation protects all configured partners in this store and assigns existing bookings to their pools. Preview first.</p><div className="flex gap-2"><button disabled={busy} className={buttonClass} onClick={() => save('preview', {})}>Preview activation</button><button disabled={busy || !ready} className={buttonClass} onClick={() => save('activate', {})}>Activate for store</button></div></div>}
    {message && <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>}
    <div className="border-t pt-3 space-y-2"><label className="text-sm">Utilization month<input aria-label="Utilization month" type="month" className={inputClass} value={month} onChange={(e) => { if (e.target.value) setMonth(e.target.value); }} /></label>
      {report.error && <p role="alert">{report.error.message}</p>}
      {report.data?.underutilized && <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">Below 50% guaranteed-pool usage in each of the last three completed weeks.</p>}
      {report.data?.months.map((m) => <p className="text-sm" key={m.month}>Protected usage: {m.guaranteedHours.toFixed(1)} / {m.allocatedHours.toFixed(1)} vehicle-hours ({m.utilization === null ? 'No allocation' : `${Math.round(m.utilization * 100)}%`}). Overflow: {m.overflowHours.toFixed(1)} vehicle-hours.</p>)}
      <details><summary className="cursor-pointer text-sm">Daily usage</summary><table className="w-full text-sm"><thead><tr><th>Date</th><th>Allocated hours</th><th>Protected hours</th><th>Overflow hours</th></tr></thead><tbody>{report.data?.days.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.allocatedHours.toFixed(1)}</td><td>{d.guaranteedHours.toFixed(1)}</td><td>{d.overflowHours.toFixed(1)}</td></tr>)}</tbody></table></details>
    </div>
  </section>;
}
