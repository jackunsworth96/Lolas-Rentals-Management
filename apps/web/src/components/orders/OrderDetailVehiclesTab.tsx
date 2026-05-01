import { useState } from 'react';
import { useAdjustDates, useSwapHelmet } from '../../api/orders.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import type { OrderItem, OrderSwap, HelmetSwap } from './useOrderDetail.js';

interface OrderDetailVehiclesTabProps {
  orderId: string;
  items: OrderItem[];
  swaps: OrderSwap[];
  helmetSwaps: HelmetSwap[];
  canAct: boolean;
}

export function OrderDetailVehiclesTab({ orderId, items, swaps, helmetSwaps, canAct }: OrderDetailVehiclesTabProps) {
  const adjustDatesMut = useAdjustDates();
  const swapHelmetMut = useSwapHelmet();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editPickup, setEditPickup] = useState('');
  const [editDropoff, setEditDropoff] = useState('');
  const [swappingHelmetItemId, setSwappingHelmetItemId] = useState<string | null>(null);
  const [newHelmetNumbers, setNewHelmetNumbers] = useState('');
  const [helmetSwapReason, setHelmetSwapReason] = useState('');

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Current Assignments</h3>
        {items.length === 0 ? (
          <p className="text-sm text-charcoal-brand/60">No vehicle assignments.</p>
        ) : (
          <div className="space-y-3">
            {items.map((i) => {
              const isEditing = editingItemId === i.id;
              return (
                <div key={i.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-gray-900">{i.vehicleName}</div>
                    <div className="text-sm text-charcoal-brand/60">
                      {i.rentalDaysCount} day{i.rentalDaysCount !== 1 ? 's' : ''} × {formatCurrency(i.rentalRate)} = {formatCurrency((i.rentalRate ?? 0) * (i.rentalDaysCount ?? 0))}
                    </div>
                  </div>

                  {!isEditing && swappingHelmetItemId !== i.id ? (
                    <>
                      <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                        <span>Pickup: {formatDate(i.pickupDatetime)}</span>
                        <span>Dropoff: {formatDate(i.dropoffDatetime)}</span>
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingItemId(i.id);
                              setEditPickup(i.pickupDatetime ? new Date(i.pickupDatetime).toISOString().slice(0, 16) : '');
                              setEditDropoff(i.dropoffDatetime ? new Date(i.dropoffDatetime).toISOString().slice(0, 16) : '');
                            }}
                            className="ml-auto text-xs font-medium text-teal-brand hover:text-teal-brand/80"
                          >
                            Adjust Dates
                          </button>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-600">
                        <span>
                          Helmets:{' '}
                          <span className="font-medium text-gray-800">
                            {i.helmetNumbers || '—'}
                          </span>
                        </span>
                        {canAct && (
                          <button
                            type="button"
                            onClick={() => {
                              setSwappingHelmetItemId(i.id);
                              setNewHelmetNumbers(i.helmetNumbers ?? '');
                              setHelmetSwapReason('');
                            }}
                            className="text-xs font-medium text-teal-brand hover:text-teal-brand/80"
                          >
                            {i.helmetNumbers ? 'Swap' : 'Assign'}
                          </button>
                        )}
                      </div>
                    </>
                  ) : swappingHelmetItemId === i.id ? (
                    <div className="mt-3 space-y-3 rounded-lg bg-sand-brand p-3">
                      <p className="text-xs font-medium text-gray-600">Swap Helmet Numbers</p>
                      <div className="flex flex-wrap gap-4">
                        <label className="block flex-1">
                          <span className="text-xs font-medium text-gray-600">New Helmet Numbers</span>
                          <input
                            type="text"
                            value={newHelmetNumbers}
                            onChange={(e) => setNewHelmetNumbers(e.target.value)}
                            placeholder="e.g. H34, H35"
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                        <label className="block flex-1">
                          <span className="text-xs font-medium text-gray-600">Reason</span>
                          <input
                            type="text"
                            value={helmetSwapReason}
                            onChange={(e) => setHelmetSwapReason(e.target.value)}
                            placeholder="e.g. Defective strap"
                            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={swapHelmetMut.isPending || !newHelmetNumbers.trim()}
                          onClick={() => {
                            swapHelmetMut.mutate(
                              { id: orderId, itemId: i.id, newHelmetNumbers: newHelmetNumbers.trim(), reason: helmetSwapReason || undefined },
                              { onSuccess: () => setSwappingHelmetItemId(null) },
                            );
                          }}
                          className="rounded-lg bg-teal-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
                        >
                          {swapHelmetMut.isPending ? 'Saving...' : 'Save Swap'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSwappingHelmetItemId(null)}
                          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-sand-brand"
                        >
                          Cancel
                        </button>
                      </div>
                      {swapHelmetMut.error && <p className="text-sm text-red-600">{(swapHelmetMut.error as Error).message}</p>}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-3 rounded-lg bg-sand-brand p-3">
                      <div className="flex flex-wrap gap-4">
                        <label className="block">
                          <span className="text-xs font-medium text-gray-600">Pickup</span>
                          <input
                            type="datetime-local"
                            value={editPickup}
                            onChange={(e) => setEditPickup(e.target.value)}
                            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs font-medium text-gray-600">Dropoff</span>
                          <input
                            type="datetime-local"
                            value={editDropoff}
                            onChange={(e) => setEditDropoff(e.target.value)}
                            className="mt-1 block rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </label>
                      </div>
                      {editPickup && editDropoff && (() => {
                        const ms = new Date(editDropoff).getTime() - new Date(editPickup).getTime();
                        const newDays = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
                        const daysDiff = newDays - i.rentalDaysCount;
                        const priceDiff = daysDiff * (i.rentalRate ?? 0);
                        return (
                          <div className={`text-sm ${daysDiff > 0 ? 'text-amber-700' : daysDiff < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                            {newDays} day{newDays !== 1 ? 's' : ''}
                            {daysDiff !== 0 && (
                              <span className="ml-2 font-medium">
                                ({daysDiff > 0 ? '+' : ''}{daysDiff} day{Math.abs(daysDiff) !== 1 ? 's' : ''}, {daysDiff > 0 ? '+' : ''}{formatCurrency(priceDiff)})
                              </span>
                            )}
                          </div>
                        );
                      })()}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={adjustDatesMut.isPending || !editPickup || !editDropoff}
                          onClick={() => {
                            adjustDatesMut.mutate(
                              {
                                id: orderId,
                                orderItemId: i.id,
                                pickupDatetime: new Date(editPickup).toISOString(),
                                dropoffDatetime: new Date(editDropoff).toISOString(),
                              },
                              { onSuccess: () => setEditingItemId(null) },
                            );
                          }}
                          className="rounded-lg bg-teal-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-brand/90 disabled:opacity-50"
                        >
                          {adjustDatesMut.isPending ? 'Saving...' : 'Save Dates'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingItemId(null)}
                          className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-sand-brand"
                        >
                          Cancel
                        </button>
                      </div>
                      {adjustDatesMut.error && <p className="text-sm text-red-600">{(adjustDatesMut.error as Error).message}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {swaps.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Vehicle Swap History</h3>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-charcoal-brand/60">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {swaps.map((s) => (
                <tr key={s.id} className="border-b hover:bg-sand-brand">
                  <td className="py-2 pr-4">{formatDate(s.swapDate)}{s.swapTime ? ` ${s.swapTime.slice(0, 5)}` : ''}</td>
                  <td className="py-2 pr-4 text-red-600">{s.oldVehicleName ?? '—'}</td>
                  <td className="py-2 pr-4 text-green-600">{s.newVehicleName ?? '—'}</td>
                  <td className="py-2 text-gray-600">{s.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {helmetSwaps.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-charcoal-brand">Helmet Swap History</h3>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-left text-charcoal-brand/60">
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">From</th>
                <th className="pb-2 pr-4">To</th>
                <th className="pb-2">Reason</th>
              </tr>
            </thead>
            <tbody>
              {helmetSwaps.map((s) => (
                <tr key={s.id} className="border-b hover:bg-sand-brand">
                  <td className="py-2 pr-4">{formatDate(s.createdAt)}</td>
                  <td className="py-2 pr-4 text-red-600">{s.oldHelmetNumbers || '—'}</td>
                  <td className="py-2 pr-4 text-green-600">{s.newHelmetNumbers || '—'}</td>
                  <td className="py-2 text-gray-600">{s.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
