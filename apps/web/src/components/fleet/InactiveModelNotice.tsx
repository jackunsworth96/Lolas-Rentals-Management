import { useFleet } from '../../api/fleet.js';
import { useVehicleModels } from '../../api/config.js';

const NON_RENTABLE_STATUSES = new Set([
  'Under Maintenance', 'Maintenance', 'Inactive', 'Sold', 'Service Vehicle', 'Closed', 'Retired', 'Pending ORCR',
]);

/**
 * Availability silently drops vehicles whose model is switched off (or missing),
 * even when the vehicle itself is marked Available. This lists them so staff
 * know why a vehicle they expect isn't offered.
 */
export function InactiveModelNotice({ storeId }: { storeId: string }) {
  const { data: fleet = [] } = useFleet(storeId);
  const { data: activeModels } = useVehicleModels() as { data: Array<{ id: string }> | undefined };
  if (!storeId || !activeModels) return null;

  const activeModelIds = new Set(activeModels.map((m) => m.id));
  const hidden = fleet.filter((v) =>
    v.storeId === storeId
    && !NON_RENTABLE_STATUSES.has(v.status ?? '')
    && (!v.modelId || !activeModelIds.has(v.modelId)),
  );
  if (hidden.length === 0) return null;

  return (
    <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-lato text-xs text-amber-800" role="note">
      Not listed: {hidden.map((v) => v.name).join(', ')}. {hidden.length === 1 ? 'Its' : 'Their'} model is switched off
      (or not set), so {hidden.length === 1 ? 'it' : 'they'} can&apos;t be booked. Turn the model on in Settings or change the
      vehicle&apos;s model in Fleet.
    </p>
  );
}
