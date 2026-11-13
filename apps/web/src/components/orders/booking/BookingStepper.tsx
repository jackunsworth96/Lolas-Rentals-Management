interface BookingStepperProps {
  steps: { key: string; label: string }[];
  currentIndex: number;
  /** Only earlier steps are selectable. */
  onSelect: (index: number) => void;
}

export function BookingStepper({ steps, currentIndex, onSelect }: BookingStepperProps) {
  return (
    <nav aria-label="Progress" className="mb-4">
      <div className="sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-semibold text-gray-900">{steps[currentIndex].label}</span>
          <span className="shrink-0 text-xs text-gray-500">Step {currentIndex + 1} of {steps.length}</span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <div key={s.key} className={`h-1.5 flex-1 rounded-full ${i <= currentIndex ? 'bg-blue-600' : 'bg-gray-200'}`} />
          ))}
        </div>
      </div>

      <div className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <div key={s.key} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
              <button
                type="button"
                onClick={() => { if (done) onSelect(i); }}
                disabled={!done}
                aria-current={current ? 'step' : undefined}
                className="group flex shrink-0 items-center gap-2 disabled:cursor-default"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                    current
                      ? 'bg-blue-600 text-white'
                      : done
                        ? 'bg-green-100 text-green-700 group-hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                <span className={`text-sm ${current ? 'font-semibold text-gray-900' : done ? 'text-gray-700 group-hover:underline' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && <div className={`mx-3 h-px flex-1 ${done ? 'bg-green-200' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
