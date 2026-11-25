import { storeClosedCopy, storeClosedDayName, storeClosedProblem } from '@lolas/shared';

/**
 * Explains why a pickup or return date can't be used. `staff` shows an amber
 * warning instead of a red block, since staff can still save special arrangements.
 */
export function StoreClosedNotice({
  pickup,
  dropoff,
  holiday,
  staff = false,
  className = '',
}: {
  pickup?: string | null;
  dropoff?: string | null;
  holiday?: string | null;
  staff?: boolean;
  className?: string;
}) {
  const closedDay = holiday || storeClosedDayName(pickup) || storeClosedDayName(dropoff);
  if (!closedDay && !storeClosedProblem(pickup || null, dropoff || null)) return null;
  const name = closedDay ?? 'this day';
  const copy = storeClosedCopy(name);
  if (staff) {
    return (
      <p role="alert" className={`rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-relaxed text-amber-800 ${className}`}>
        {copy.title}. {copy.body} Customers can't book this day online; only save it if you've arranged it with the customer.
      </p>
    );
  }
  return (
    <div role="alert" className={`rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-center ${className}`}>
      <p className="font-lato text-base font-bold text-red-800">{copy.title}</p>
      <p className="font-lato mt-1 text-sm leading-relaxed text-red-800/90">{copy.body}</p>
    </div>
  );
}
