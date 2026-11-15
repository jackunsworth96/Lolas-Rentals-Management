import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../common/Modal.js';
import { ConfirmDialog } from '../common/ConfirmDialog.js';
import {
  cancelTransfer,
  formatVanType,
  notifyDriver,
  updateAccommodation,
  updateCollectVia,
  updatePickupTime,
  type TransferCollector,
  type TransferRow,
} from '../../api/transfers.js';
import { formatCurrency } from '../../utils/currency.js';
import {
  flightTimeLabel,
  hhmm,
  isCancelled,
  isSettled,
  moneyState,
  MONEY_TONE_CLASSES,
  pickupWindow,
  transferCut,
  transferLolasShare,
  transferTotal,
} from './transfer-state.js';

interface Props {
  transfer: TransferRow;
  readOnly: boolean;
  today: string;
  onClose: () => void;
  onToast: (msg: string, type: 'success' | 'error') => void;
}

const FIELD = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-teal-brand focus:outline-none focus:ring-1 focus:ring-teal-brand';

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="truncate text-sm text-gray-900">{children}</dd>
    </div>
  );
}

export function TransferDetailsModal({ transfer: t, readOnly, today, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const [pickupTime, setPickupTime] = useState(hhmm(t.pickupTime) ?? '');
  const [accommodation, setAccommodation] = useState(t.accommodation ?? '');
  const [collectVia, setCollectVia] = useState<TransferCollector>(t.collectVia);
  const [saving, setSaving] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  const state = moneyState(t);
  const editable = !readOnly && !isCancelled(t) && !isSettled(t);
  const canChangeCollector = editable && t.amountPaid <= 0 && !t.billedToOrder;
  const canCancel = editable && t.amountPaid <= 0;
  const dirty =
    pickupTime !== (hhmm(t.pickupTime) ?? '')
    || accommodation.trim() !== (t.accommodation ?? '')
    || collectVia !== t.collectVia;

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ['transfers'] });
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    try {
      if (pickupTime !== (hhmm(t.pickupTime) ?? '')) await updatePickupTime(t.id, pickupTime || null);
      if (accommodation.trim() !== (t.accommodation ?? '')) await updateAccommodation(t.id, accommodation.trim() || null);
      if (collectVia !== t.collectVia) await updateCollectVia(t.id, collectVia);
      await refresh();
      onToast('Transfer updated', 'success');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  async function handleNotify() {
    setError('');
    setNotifying(true);
    try {
      await notifyDriver(t.id);
      onToast('Driver notified', 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to notify driver');
    } finally {
      setNotifying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelTransfer(t.id);
      await refresh();
      onToast('Transfer cancelled', 'success');
      setConfirmCancel(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel transfer');
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={t.customerName}
        size="lg"
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {canCancel && (
                <button
                  type="button"
                  onClick={() => setConfirmCancel(true)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  Cancel transfer
                </button>
              )}
              {editable && t.serviceDate >= today && (
                <button
                  type="button"
                  onClick={() => void handleNotify()}
                  disabled={notifying}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {notifying ? 'Sending…' : 'Email driver'}
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Close
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  className="rounded-lg bg-teal-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${MONEY_TONE_CLASSES[state.tone]}`}>
              {state.label}
            </span>
            {t.driverConfirmed ? (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
                Driver confirmed
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200">
                Driver not confirmed
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Detail label="Route">{t.route}</Detail>
            <Detail label="Date">{t.serviceDate}</Detail>
            <Detail label="Pickup">{pickupWindow(t) ?? '—'}</Detail>
            <Detail label="Flight">
              {[t.flightNumber, flightTimeLabel(t.flightTime)].filter(Boolean).join(' · ') || '—'}
            </Detail>
            <Detail label="Vehicle">{formatVanType(t.vanType)} · {t.paxCount} pax</Detail>
            <Detail label="Contact">{t.contactNumber ?? '—'}</Detail>
            <Detail label="Email">{t.customerEmail ?? '—'}</Detail>
            <Detail label="Source">{t.bookingSource ?? '—'}</Detail>
            <Detail label="Rental order">{t.orderId ?? '—'}</Detail>
          </dl>

          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-3 tabular-nums">
            <Detail label="Fare">{formatCurrency(transferTotal(t))}</Detail>
            <Detail label="Driver cut">{formatCurrency(transferCut(t))}</Detail>
            <Detail label="Lola's keeps">{formatCurrency(transferLolasShare(t))}</Detail>
            <Detail label="Paid">{formatCurrency(t.amountPaid)}</Detail>
            <Detail label="Driver holds">{formatCurrency(t.driverCollectedAmount)}</Detail>
            <Detail label="Settled">{t.driverSettledAt ? t.driverSettledAt.slice(0, 10) : '—'}</Detail>
          </dl>

          {t.opsNotes && (
            <p className="text-pretty rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">{t.opsNotes}</p>
          )}

          {editable && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Pickup time</span>
                <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className={FIELD} />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Accommodation</span>
                <input
                  type="text"
                  value={accommodation}
                  onChange={(e) => setAccommodation(e.target.value)}
                  placeholder="Hotel / villa…"
                  className={FIELD}
                />
              </label>
              {canChangeCollector && (
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">Who collects payment</span>
                  <select value={collectVia} onChange={(e) => setCollectVia(e.target.value as TransferCollector)} className={FIELD}>
                    <option value="lolas">Lola&apos;s</option>
                    <option value="driver">Driver</option>
                  </select>
                </label>
              )}
            </div>
          )}

          <p className="font-mono text-xs text-gray-400">{t.id}</p>

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this transfer?"
        message={<>The driver will no longer see {t.customerName}&apos;s {t.serviceDate} transfer. This can&apos;t be undone.</>}
        confirmLabel="Cancel transfer"
        destructive
        busy={cancelling}
        onConfirm={() => void handleCancel()}
        onClose={() => setConfirmCancel(false)}
      />
    </>
  );
}
