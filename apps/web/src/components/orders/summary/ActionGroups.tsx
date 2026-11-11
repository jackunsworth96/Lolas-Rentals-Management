import { useState } from 'react';

export interface ActionItem {
  id: string;
  label: string;
  onSelect: () => void;
  active?: boolean;
  tone?: 'default' | 'danger';
  hidden?: boolean;
}

export interface ActionGroup {
  id: string;
  label: string;
  /** Suggested next step for the current order state; opened by default. */
  highlight?: boolean;
  items: ActionItem[];
}

interface ActionGroupsProps {
  groups: ActionGroup[];
}

export function ActionGroups({ groups }: ActionGroupsProps) {
  const visibleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.hidden) }))
    .filter((g) => g.items.length > 0);
  const [openGroupId, setOpenGroupId] = useState<string | null>(
    () => visibleGroups.find((g) => g.highlight)?.id ?? null,
  );
  const openGroup = visibleGroups.find((g) => g.id === openGroupId) ?? null;

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {visibleGroups.map((g) => {
          // A group with a single action is just that action: no second click needed.
          const single = g.items.length === 1 ? g.items[0] : null;
          const isOpen = single ? !!single.active : g.id === openGroupId;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => (single ? single.onSelect() : setOpenGroupId(isOpen ? null : g.id))}
              aria-expanded={single ? undefined : isOpen}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold transition ${
                isOpen
                  ? g.highlight
                    ? 'border-green-600 bg-green-600 text-white'
                    : 'border-teal-brand bg-teal-brand text-white'
                  : g.highlight
                    ? 'border-green-500 bg-green-50 text-green-800 hover:bg-green-100'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {single ? single.label : g.label}
            </button>
          );
        })}
      </div>
      {openGroup && openGroup.items.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {openGroup.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onSelect}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                item.active
                  ? item.tone === 'danger'
                    ? 'border-red-600 bg-red-600 text-white'
                    : 'border-teal-brand bg-teal-50 text-teal-900'
                  : item.tone === 'danger'
                    ? 'border-red-200 text-red-700 hover:bg-red-50'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
