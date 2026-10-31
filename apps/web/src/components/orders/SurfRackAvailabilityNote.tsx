import type { SurfRackAvailability } from '../../api/surf-racks.js';
import { SURF_RACK_UNTRACKED_NOTICE } from '../basket/AddOnsSection.js';

interface Props {
  availability: SurfRackAvailability | undefined;
  loading?: boolean;
  /** Racks this booking is asking for. */
  requested: number;
  /** False when the chosen bike has no rack mount; null/undefined when no bike is chosen. */
  vehicleHasMount?: boolean | null;
}

/** True when a tracked store cannot cover the requested racks. */
export function surfRackShortfall(availability: SurfRackAvailability | undefined, requested: number): boolean {
  return !!availability?.tracked && requested > 0 && availability.remaining < requested;
}

export function SurfRackAvailabilityNote({ availability, loading, requested, vehicleHasMount }: Props) {
  if (loading) {
    return <p className="mt-1 font-lato text-xs text-gray-400">Checking surf rack stock…</p>;
  }
  if (!availability) return null;

  const mountWarning = requested > 0 && vehicleHasMount === false && (
    <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 font-lato text-xs text-amber-800">
      The selected bike has no surf rack mount — pick a bike with the surf rack icon.
    </p>
  );

  if (!availability.tracked) {
    return (
      <>
        {requested > 0 && (
          <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 font-lato text-xs text-amber-800">
            {SURF_RACK_UNTRACKED_NOTICE}
          </p>
        )}
        {mountWarning}
      </>
    );
  }

  const short = surfRackShortfall(availability, requested);
  return (
    <>
      <p className={`mt-1 font-lato text-xs ${availability.remaining === 0 || short ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
        {availability.remaining === 0
          ? 'No surf racks free for these dates'
          : `${availability.remaining} of ${availability.total} surf rack${availability.total === 1 ? '' : 's'} free for these dates`}
        {short && availability.remaining > 0 ? ` — only ${availability.remaining} available` : ''}
      </p>
      {mountWarning}
    </>
  );
}
