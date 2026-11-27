import { useMemo } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import {
  PERMISSION_GROUPS,
  applyAreaLevel,
  areaLevel,
  getPermissionDefinition,
  permissionsInArea,
  togglePermission,
  withRequiredPermissions,
  type AccessLevelId,
  type PermissionArea,
  type PermissionKey,
} from '@lolas/shared';
import { AccordionItem } from '../../common/Accordion.js';
import { SegmentedControl } from '../../common/SegmentedControl.js';
import { AREAS_BY_GROUP, grantsFor, levelOptions, matchesSearch, permLabel } from './access-utils.js';

interface PermissionPickerProps {
  selected: ReadonlySet<PermissionKey>;
  onChange: (next: Set<PermissionKey>) => void;
  /** Permissions the editor holds; others can be removed but not added. */
  grantable: ReadonlySet<string>;
  advanced: boolean;
  search: string;
  readOnly?: boolean;
}

/** Why a selected permission cannot be switched off on its own. */
function requiredBy(key: PermissionKey, selected: ReadonlySet<PermissionKey>): PermissionKey[] {
  return [...selected].filter((k) => k !== key && (getPermissionDefinition(k)?.requires ?? []).includes(key));
}

function AreaRow({ area, selected, onChange, grantable, advanced, search, readOnly }: PermissionPickerProps & { area: PermissionArea }) {
  const level = areaLevel(selected, area.id);
  const keys = permissionsInArea(area.id);
  const grants = grantsFor(area, selected);
  const sensitiveHeld = keys.some((k) => selected.has(k) && getPermissionDefinition(k)?.sensitive);

  const options = levelOptions(area).map((o) => {
    if (o.id === 'none') return o;
    const needed = withRequiredPermissions(area.levels.find((l) => l.id === o.id)?.permissions ?? []);
    const missing = [...needed].filter((k) => !selected.has(k) && !grantable.has(k));
    return missing.length > 0
      ? { ...o, disabled: true, title: `You can't give out ${missing.map(permLabel).join(', ')} because you don't have it` }
      : o;
  });
  const options2 = level === 'custom' ? [...options, { id: 'custom' as const, label: 'Custom', disabled: true }] : options;

  return (
    <AccordionItem
      title={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {area.label}
          {sensitiveHeld && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
              <ShieldAlert className="h-3 w-3" aria-hidden /> Sensitive
            </span>
          )}
        </span>
      }
      subtitle={area.description}
      defaultOpen={advanced || !!search}
      key={`${area.id}-${advanced}-${!!search}`}
      aside={
        <SegmentedControl<AccessLevelId | 'custom'>
          ariaLabel={`${area.label} access level`}
          size="sm"
          options={options2}
          value={level}
          disabled={readOnly}
          onChange={(id) => { if (id !== 'custom') onChange(applyAreaLevel(selected, area.id, id)); }}
        />
      }
    >
      {grants.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">This lets them</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
            {grants.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      ) : (
        <p className="mb-3 text-sm text-gray-500">No access to {area.label.toLowerCase()}.</p>
      )}

      {advanced && (
        <ul className="space-y-2">
          {keys.map((k) => {
            const def = getPermissionDefinition(k)!;
            const on = selected.has(k);
            const lockedBy = on ? requiredBy(k, selected) : [];
            const cannotGrant = !on && !grantable.has(k);
            const disabled = readOnly || lockedBy.length > 0 || cannotGrant;
            return (
              <li key={k}>
                <label className={`flex items-start gap-3 rounded-lg border p-3 ${on ? 'border-teal-200 bg-teal-50/40' : 'border-gray-200'} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    checked={on}
                    disabled={disabled}
                    onChange={(e) => onChange(togglePermission(selected, k, e.target.checked))}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-gray-900">
                      {def.label}
                      {def.sensitive && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">Sensitive</span>
                      )}
                    </span>
                    <span className="block text-xs text-gray-600">{def.description}</span>
                    {def.requires && def.requires.length > 0 && (
                      <span className="mt-1 block text-xs text-gray-500">Also turns on: {def.requires.map(permLabel).join(', ')}</span>
                    )}
                    {lockedBy.length > 0 && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Lock className="h-3 w-3" aria-hidden /> Needed by {lockedBy.map(permLabel).join(', ')}
                      </span>
                    )}
                    {cannotGrant && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                        <Lock className="h-3 w-3" aria-hidden /> You don't have this permission, so you can't give it out
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </AccordionItem>
  );
}

export function PermissionPicker(props: PermissionPickerProps) {
  const groups = useMemo(
    () => PERMISSION_GROUPS
      .map((g) => ({ ...g, areas: (AREAS_BY_GROUP[g.id] ?? []).filter((a) => matchesSearch(a, props.search)) }))
      .filter((g) => g.areas.length > 0),
    [props.search],
  );

  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No permissions match "{props.search}".</p>;
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`group-${g.id}`}>
          <h3 id={`group-${g.id}`} className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">{g.label}</h3>
          <div className="rounded-lg border border-gray-200 px-3">
            {g.areas.map((a) => <AreaRow key={a.id} area={a} {...props} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
