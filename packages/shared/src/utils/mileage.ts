/** A reading this far above the last one asks the user to double-check. */
export const MILEAGE_JUMP_KM = 2000;

export interface MileageChangeAssessment {
  /** The new reading should be confirmed before it is saved. */
  warn: boolean;
  /** A vehicle-record edit must include a reason. Inspections do not. */
  reasonRequired: boolean;
  /** The vehicle has no previous mileage yet. */
  firstReading: boolean;
  /** The new reading is about ten times the last one, or about a tenth of it. */
  extraDigit: boolean;
  message: string | null;
}

const NO_WARNING: MileageChangeAssessment = {
  warn: false,
  reasonRequired: false,
  firstReading: false,
  extraDigit: false,
  message: null,
};

/** Round to the same 0.1 km precision stored on the vehicle. */
export function normalizeMileage(value: number): number {
  return Math.round(Number(value) * 10) / 10;
}

/**
 * Whole-kilometer reading that an inspection will write onto the vehicle.
 * Blank and 0 do not update the vehicle, so they return null.
 */
export function parseInspectionKm(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function formatKm(value: number): string {
  return value.toLocaleString('en-PH', { maximumFractionDigits: 1 });
}

function looksLikeExtraDigit(previous: number, next: number): boolean {
  if (previous <= 0 || next <= 0) return false;
  const ratio = next / previous;
  const inverse = previous / next;
  return (ratio >= 8 && ratio <= 12) || (inverse >= 8 && inverse <= 12);
}

/**
 * Compare a proposed odometer reading with the vehicle's current mileage.
 * A first reading (previous is 0) is noted, and is not treated as a jump.
 */
export function assessMileageChange(
  previousMileage: number,
  nextMileage: number,
): MileageChangeAssessment {
  const previous = normalizeMileage(previousMileage);
  const next = normalizeMileage(nextMileage);
  if (!Number.isFinite(previous) || !Number.isFinite(next)) return NO_WARNING;

  if (previous <= 0) {
    return {
      warn: false,
      reasonRequired: false,
      firstReading: true,
      extraDigit: false,
      message: 'No previous mileage — confirm this is the odometer.',
    };
  }

  if (next === previous) return NO_WARNING;

  const extraDigit = looksLikeExtraDigit(previous, next);
  const decreased = next < previous;
  const jumped = next - previous >= MILEAGE_JUMP_KM;
  if (!extraDigit && !decreased && !jumped) return NO_WARNING;

  let message: string;
  if (extraDigit && next > previous) {
    message = `This looks like an extra digit. Last reading was ${formatKm(previous)} km. You entered ${formatKm(next)} km.`;
  } else if (extraDigit && next < previous) {
    message = `This looks like a missing digit. Last reading was ${formatKm(previous)} km. You entered ${formatKm(next)} km.`;
  } else if (decreased) {
    message = `This is lower than the last reading (${formatKm(previous)} → ${formatKm(next)} km). Odometers do not go backwards. Save only if the last reading was wrong.`;
  } else {
    message = `This is ${formatKm(next - previous)} km higher than the last reading (${formatKm(previous)} → ${formatKm(next)} km).`;
  }

  return {
    warn: true,
    reasonRequired: true,
    firstReading: false,
    extraDigit,
    message,
  };
}
