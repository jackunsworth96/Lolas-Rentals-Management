type Est = { id: number; name: string };

type Props = {
  loadingEst: boolean;
  establishmentsError: string;
  establishments: Est[];
  establishmentId: string;
  setEstablishmentId: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  visitDate: string;
  setVisitDate: (v: string) => void;
  numPeople: string;
  setNumPeople: (v: string) => void;
};

const inp =
  'w-full rounded-lg border-none px-4 py-3 transition-all duration-200 focus:scale-[1.01] focus:ring-2';

export function PawCardSavingsDetailsFields({
  loadingEst,
  establishmentsError,
  establishments,
  establishmentId,
  setEstablishmentId,
  amount,
  setAmount,
  visitDate,
  setVisitDate,
  numPeople,
  setNumPeople,
}: Props) {
  return (
    <div className="space-y-4 font-lato">
      {loadingEst && <p className="text-sm" style={{ color: '#6e7976' }}>Loading partners…</p>}
      {establishmentsError && <p className="text-sm text-red-600">{establishmentsError}</p>}

      <div>
        <label className="mb-1.5 ml-1 block text-sm font-semibold">Business Visited</label>
        <select
          required
          value={establishmentId}
          onChange={(e) => setEstablishmentId(e.target.value)}
          disabled={loadingEst || !!establishmentsError}
          className={inp}
          style={{ background: '#fff', outlineColor: '#1A7A6E' }}
        >
          <option value="">Select establishment</option>
          {establishments.map((est) => (
            <option key={est.id} value={String(est.id)}>
              {est.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 ml-1 block text-sm font-semibold">Amount Saved (₱)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={inp}
            style={{ background: '#fff', outlineColor: '#1A7A6E' }}
          />
        </div>
        <div>
          <label className="mb-1.5 ml-1 block text-sm font-semibold">Date of Visit</label>
          <input
            type="date"
            required
            value={visitDate}
            onChange={(e) => setVisitDate(e.target.value)}
            className={inp}
            style={{ background: '#fff', outlineColor: '#1A7A6E' }}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 ml-1 block text-sm font-semibold">Number of People</label>
        <input
          type="number"
          min={1}
          step={1}
          value={numPeople}
          onChange={(e) => setNumPeople(e.target.value)}
          placeholder="1"
          className={inp}
          style={{ background: '#fff', outlineColor: '#1A7A6E' }}
        />
      </div>
    </div>
  );
}
