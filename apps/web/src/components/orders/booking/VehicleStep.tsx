import type { ComponentProps } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Badge } from '../../common/Badge.js';
import { InactiveModelNotice } from '../../fleet/InactiveModelNotice.js';
import { isSurfRackAddon } from '../../basket/AddOnsSection.js';
import { SurfRackAvailabilityNote } from '../SurfRackAvailabilityNote.js';
import type { AvailableVehicle } from '../../../api/fleet.js';
import { formatCurrency } from '../../../utils/currency.js';
import { DateTimeField } from './DateTimeField.js';
import { inputClass, vehicleLineTotal, type AddonRow, type ConfigLocation, type VehicleRow } from './types.js';

type LocationKind = 'pickup' | 'dropoff';

interface VehicleStepProps {
  storeId: string;
  vehicles: VehicleRow[];
  availability: Array<UseQueryResult<AvailableVehicle[]>>;
  fleet: Array<Record<string, unknown>> | undefined;
  bookedModelId: string | null;
  modelNameFor: (modelId: string | null | undefined) => string;
  onUpdateVehicle: (index: number, patch: Partial<VehicleRow>) => void;
  onRemoveVehicle: (index: number) => void;
  onOpenInspection: () => void;
  locations: ConfigLocation[] | undefined;
  locationOptionLabel: (loc: ConfigLocation, kind: LocationKind) => string;
  partnerName: string | null;
  partnerLocationOption: Record<LocationKind, string | null>;
  websiteLocation: Record<LocationKind, string>;
  addons: AddonRow[];
  addonsLoaded: boolean;
  onToggleAddon: (index: number) => void;
  rackAvailability: ComponentProps<typeof SurfRackAvailabilityNote>['availability'];
  rackLoading: boolean;
  rackRequested: number;
  assignedVehicleHasMount: boolean | null;
  onWalkInBooking?: () => void;
}

export function VehicleStep({
  storeId,
  vehicles,
  availability,
  fleet,
  bookedModelId,
  modelNameFor,
  onUpdateVehicle,
  onRemoveVehicle,
  onOpenInspection,
  locations,
  locationOptionLabel,
  partnerName,
  partnerLocationOption,
  websiteLocation,
  addons,
  addonsLoaded,
  onToggleAddon,
  rackAvailability,
  rackLoading,
  rackRequested,
  assignedVehicleHasMount,
  onWalkInBooking,
}: VehicleStepProps) {
  function renderLocationSelect(i: number, v: VehicleRow, kind: LocationKind) {
    const value = kind === 'pickup' ? v.pickupLocation : v.dropoffLocation;
    const showPartnerOption = (partnerLocationOption[kind] || value === partnerName)
      && partnerName
      && !locations?.some((l) => String(l.name) === partnerName);
    return (
      <label className="block">
        <span className="text-sm text-gray-600">{kind === 'pickup' ? 'Pickup location' : 'Dropoff location'}</span>
        <select
          value={value}
          onChange={(e) => onUpdateVehicle(i, kind === 'pickup' ? { pickupLocation: e.target.value } : { dropoffLocation: e.target.value })}
          className={inputClass}
        >
          <option value="">Select...</option>
          {showPartnerOption && (
            <option value={partnerName}>{partnerName} (Partner establishment - Free)</option>
          )}
          {(locations ?? []).map((l) => (
            <option key={String(l.id)} value={String(l.name)}>
              {locationOptionLabel(l, kind)}
            </option>
          ))}
        </select>
        {!value && websiteLocation[kind] && (
          <p className="mt-1 text-xs text-amber-600">Website order: {websiteLocation[kind]}</p>
        )}
      </label>
    );
  }

  return (
    <div className="space-y-4">
      {vehicles.map((v, i) => {
        const result = availability[i];
        const selectableVehicles = (result?.data ?? []).filter((candidate) =>
          !vehicles.some((other, index) => index !== i && other.vehicleId === candidate.id),
        );
        const bookedModelVehicles = bookedModelId
          ? selectableVehicles.filter((fv) => fv.modelId === bookedModelId)
          : selectableVehicles;
        const otherModelVehicles = bookedModelId
          ? selectableVehicles.filter((fv) => fv.modelId !== bookedModelId)
          : [];
        const selectedModelId = v.vehicleId
          ? (selectableVehicles.find((fv) => fv.id === v.vehicleId)?.modelId
            ?? (fleet?.find((fv) => fv.id === v.vehicleId)?.modelId as string | undefined))
          : undefined;
        const modelMismatch = Boolean(bookedModelId && v.vehicleId && selectedModelId !== bookedModelId);

        return (
          <section key={i} className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium text-gray-900">
                Vehicle {i + 1}
                {bookedModelId && <span className="ml-2 text-sm font-normal text-gray-500">booked: {modelNameFor(bookedModelId)}</span>}
              </h3>
              <div className="flex items-center gap-3">
                {vehicles.length > 1 && (
                  <button type="button" onClick={() => onRemoveVehicle(i)} className="text-sm text-red-500 hover:text-red-700">
                    Remove
                  </button>
                )}
                {i === 0 && (
                  <button
                    type="button"
                    onClick={onOpenInspection}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-700 transition-colors hover:bg-teal-50"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Inspection
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
              <div className="block">
                <span className="text-sm text-gray-600">Vehicle</span>
                <select
                  aria-label={`Vehicle ${i + 1}`}
                  value={v.vehicleId}
                  disabled={result?.isFetching || !result?.isSuccess}
                  onChange={(e) => onUpdateVehicle(i, { vehicleId: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Select vehicle...</option>
                  {otherModelVehicles.length === 0 ? (
                    bookedModelVehicles.map((fv) => (
                      <option key={String(fv.id)} value={String(fv.id)}>
                        {String(fv.name ?? fv.id)}
                      </option>
                    ))
                  ) : (
                    <>
                      <optgroup label={`Booked model: ${modelNameFor(bookedModelId)}`}>
                        {bookedModelVehicles.map((fv) => (
                          <option key={String(fv.id)} value={String(fv.id)}>
                            {String(fv.name ?? fv.id)}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Other models (not what the customer booked)">
                        {otherModelVehicles.map((fv) => (
                          <option key={String(fv.id)} value={String(fv.id)}>
                            {`${String(fv.name ?? fv.id)} (${modelNameFor(fv.modelId)})`}
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>
                {modelMismatch && (
                  <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900" role="alert">
                    The customer booked a {modelNameFor(bookedModelId)}, but this is a {modelNameFor(selectedModelId)}.
                    The rate stays at the booked {modelNameFor(bookedModelId)} price. Only continue if the customer
                    is really being given this vehicle.
                  </p>
                )}
                {bookedModelId && result?.isSuccess && !result.isFetching
                  && bookedModelVehicles.length === 0 && otherModelVehicles.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    No {modelNameFor(bookedModelId)} is free for these dates. If the customer has a vehicle that isn&apos;t
                    in the fleet yet (e.g. a sub-leased one), add it in Fleet first instead of using another model.
                  </p>
                )}
                {result?.isFetching && <p className="mt-1 text-xs text-gray-500" role="status">Checking available motorcycles...</p>}
                {result?.isError && <p className="mt-1 text-xs text-red-600" role="alert">Could not check availability. <button type="button" onClick={() => void result.refetch()} className="underline">Retry</button></p>}
                {result?.isSuccess && !result.isFetching && selectableVehicles.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">No motorcycles are available for these dates.</p>
                )}
                {i === 0 && <InactiveModelNotice storeId={storeId} />}
                {v.vehicleId && !fleet?.find((fv) => fv.id === v.vehicleId)?.modelId && (
                  <p className="mt-1 text-xs text-amber-600">No model linked — set vehicle model in fleet settings to auto-fill rate.</p>
                )}
              </div>

              <label className="block">
                <span className="text-sm text-gray-600">Rental rate (per day)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={v.rentalRate}
                  onChange={(e) => onUpdateVehicle(i, { rentalRate: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>

              <DateTimeField
                label="Pickup"
                value={v.pickupDatetime}
                onChange={(value) => onUpdateVehicle(i, { pickupDatetime: value })}
                dateAriaLabel={`Vehicle ${i + 1} pickup date`}
              />
              <DateTimeField
                label="Dropoff"
                value={v.dropoffDatetime}
                onChange={(value) => onUpdateVehicle(i, { dropoffDatetime: value })}
                dateAriaLabel={`Vehicle ${i + 1} return date`}
                warnOutsideHours
              />

              {renderLocationSelect(i, v, 'pickup')}
              {renderLocationSelect(i, v, 'dropoff')}

              <label className="block">
                <span className="text-sm text-gray-600">Helmet numbers</span>
                <input
                  type="text"
                  value={v.helmetNumbers}
                  onChange={(e) => onUpdateVehicle(i, { helmetNumbers: e.target.value })}
                  className={inputClass}
                  placeholder="e.g. H12, H13"
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-600">Discount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={v.discount}
                  onChange={(e) => onUpdateVehicle(i, { discount: Number(e.target.value) })}
                  className={inputClass}
                />
              </label>
            </div>

            <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 text-sm text-gray-600">
              <span>Days: <strong className="text-gray-900">{v.rentalDaysCount}</strong></span>
              <span>Subtotal: <strong className="text-gray-900">{formatCurrency(vehicleLineTotal(v))}</strong></span>
            </div>
          </section>
        );
      })}

      <p className="text-xs text-gray-500">
        Need another vehicle? Create a separate{' '}
        {onWalkInBooking ? (
          <button type="button" className="text-teal-700 underline" onClick={onWalkInBooking}>
            walk-in booking
          </button>
        ) : (
          'walk-in booking'
        )}
        .
      </p>

      <section className="rounded-lg border border-gray-200">
        <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <h3 className="font-medium text-gray-900">Add-ons</h3>
          {addons.some((a) => a.enabled) && (
            <span className="text-sm text-gray-600">
              {addons.filter((a) => a.enabled).length} selected ·{' '}
              <strong className="tabular-nums text-gray-900">
                {formatCurrency(addons.filter((a) => a.enabled).reduce((s, a) => s + a.totalAmount, 0))}
              </strong>
            </span>
          )}
        </div>
        {!addonsLoaded ? (
          <p className="px-4 py-3 text-sm text-gray-500">Loading add-ons...</p>
        ) : addons.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">No add-ons configured for this store.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {addons.map((addon, i) => (
              <label
                key={i}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition ${
                  addon.enabled ? 'bg-blue-50' : 'hover:bg-gray-50'
                } ${i === addons.length - 1 ? 'rounded-b-lg' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={addon.enabled}
                  onChange={() => onToggleAddon(i)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">{addon.addonName}</span>
                  <span className="block text-xs text-gray-500">
                    {addon.addonType === 'per_day'
                      ? `${formatCurrency(addon.addonPrice)} / day × ${addon.quantity} ${addon.quantity === 1 ? 'day' : 'days'}`
                      : `${formatCurrency(addon.addonPrice)} one-time`}
                    {addon.mutualExclusivityGroup && (
                      <Badge color="gray" className="ml-2">{addon.mutualExclusivityGroup}</Badge>
                    )}
                  </span>
                  {isSurfRackAddon({ name: addon.addonName }) && (
                    <SurfRackAvailabilityNote
                      availability={rackAvailability}
                      loading={rackLoading && !rackAvailability}
                      requested={addon.enabled ? rackRequested : 0}
                      vehicleHasMount={assignedVehicleHasMount}
                    />
                  )}
                </span>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${addon.enabled ? 'text-gray-900' : 'text-gray-500'}`}>
                  {formatCurrency(addon.totalAmount)}
                </span>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
