import type { LucideIcon } from 'lucide-react';

export interface DashboardTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

export function DashboardTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: DashboardTab<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div role="tablist" className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      {tabs.map(({ id, label, icon: Icon }) => {
        const selected = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
              selected ? 'bg-teal-brand text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
