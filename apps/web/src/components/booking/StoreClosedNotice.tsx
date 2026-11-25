import { storeClosedProblem } from '@lolas/shared';

/**
 * Explains why a pickup or return date can't be used. `staff` shows an amber
 * warning instead of a red block, since staff can still save special arrangements.
 */
export function StoreClosedNotice({
  pickup,
  dropoff,
  staff = false,
  className = '',
}: {
  pickup?: string | null;
  dropoff?: string | null;
  staff?: boolean;
  className?: string;
}) {
  const problem = storeClosedProblem(pickup || null, dropoff || null);
  if (!problem) return null;
  const tone = staff
    ? 'border-amber-200 bg-amber-50 text-amber-800'
    : 'border-red-200 bg-red-50 text-red-700';
  return (
    <p role="alert" className={`rounded-lg border px-3 py-2 text-xs font-semibold leading-relaxed ${tone} ${className}`}>
      {staff
        ? `${problem.replace(' Please choose another date.', '')} Customers can't book this day online; only save it if you've arranged it with the customer.`
        : problem}
    </p>
  );
}
