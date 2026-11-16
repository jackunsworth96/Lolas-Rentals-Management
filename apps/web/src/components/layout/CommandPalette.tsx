import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Settings, Star } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store.js';
import { useAuthStore } from '../../stores/auth-store.js';
import { usePins } from '../../stores/nav-prefs-store.js';
import { isArchivePath } from '../../utils/archive-mode.js';
import { SETTINGS_SECTIONS } from '../../pages/settings/settings-tabs.js';
import { MAX_PINS, NAV_GROUPS, SETTINGS_ITEM, hasNavPermission, type NavItem } from './nav-config.js';

interface Entry {
  key: string;
  label: string;
  group: string;
  to: string;
  icon: NavItem['icon'];
  haystack: string;
  /** Set for nav pages, which can be pinned. */
  pinPath?: string;
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandOpen);
  const setOpen = useUIStore((s) => s.setCommandOpen);
  const archiveMode = useUIStore((s) => s.archiveMode);
  const perms = useAuthStore((s) => s.user?.permissions ?? []);
  const { pins, togglePin } = usePins();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUIStore.getState().commandOpen);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const entries = useMemo<Entry[]>(() => {
    const groups = [...NAV_GROUPS, { label: 'Admin', items: [SETTINGS_ITEM] }];
    const list: Entry[] = groups.flatMap((g) =>
      g.items
        .filter((i) => hasNavPermission(i.perm, perms) && (!archiveMode || isArchivePath(i.path)))
        .map((i) => ({
          key: i.path,
          label: i.label,
          group: g.label,
          to: i.path,
          icon: i.icon,
          haystack: [i.label, g.label, ...(i.keywords ?? [])].join(' ').toLowerCase(),
          pinPath: i.path,
        })),
    );
    if (!archiveMode && hasNavPermission(SETTINGS_ITEM.perm, perms)) {
      for (const section of SETTINGS_SECTIONS) {
        for (const tab of section.tabs) {
          list.push({
            key: `settings-${tab.key}`,
            label: tab.label,
            group: `Settings · ${section.label}`,
            to: `/settings?tab=${tab.key}`,
            icon: Settings,
            haystack: `${tab.label} settings ${section.label}`.toLowerCase(),
          });
        }
      }
    }
    return list;
  }, [perms, archiveMode]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const pinned = pins.map((p) => entries.find((e) => e.pinPath === p)).filter((e): e is Entry => !!e);
      return [...pinned, ...entries.filter((e) => e.pinPath && !pins.includes(e.pinPath))];
    }
    const words = q.split(/\s+/);
    return entries
      .filter((e) => words.every((w) => e.haystack.includes(w)))
      .sort((a, b) => Number(!a.label.toLowerCase().startsWith(q)) - Number(!b.label.toLowerCase().startsWith(q)));
  }, [entries, query, pins]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  if (!open) return null;

  function go(entry: Entry | undefined) {
    if (!entry) return;
    setOpen(false);
    navigate(entry.to);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[index]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const pinsFull = pins.length >= MAX_PINS;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-3 pt-[10vh]" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-label="Search pages"
        className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-gray-200 px-4">
          <Search className="h-4 w-4 shrink-0 text-gray-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages and settings…"
            className="w-full border-0 py-3 text-sm focus:outline-none focus:ring-0"
          />
          <kbd className="hidden rounded border border-gray-200 px-1.5 text-[10px] text-gray-400 sm:inline">Esc</kbd>
        </div>
        <ul ref={listRef} className="flex-1 overflow-y-auto py-1">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-400">No matches</li>}
          {results.map((entry, i) => {
            const pinned = !!entry.pinPath && pins.includes(entry.pinPath);
            return (
              <li key={entry.key} data-index={i}>
                <div
                  className={`flex items-center gap-3 px-4 py-2 ${i === index ? 'bg-teal-50' : ''}`}
                  onMouseMove={() => setIndex(i)}
                >
                  <button type="button" onClick={() => go(entry)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <entry.icon className={`h-4 w-4 shrink-0 ${i === index ? 'text-teal-700' : 'text-gray-400'}`} />
                    <span className="truncate text-sm font-medium text-gray-800">{entry.label}</span>
                    <span className="ml-auto shrink-0 text-xs text-gray-400">{entry.group}</span>
                  </button>
                  {entry.pinPath && (
                    <button
                      type="button"
                      onClick={() => togglePin(entry.pinPath!)}
                      disabled={!pinned && pinsFull}
                      className="shrink-0 rounded p-1 text-gray-300 hover:text-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={pinned ? `Unpin ${entry.label}` : `Pin ${entry.label}`}
                      title={pinned ? 'Unpin' : pinsFull ? `You can pin up to ${MAX_PINS} pages` : 'Pin to top of menu'}
                    >
                      <Star className={`h-4 w-4 ${pinned ? 'fill-amber-400 text-amber-500' : ''}`} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-400">
          Star up to {MAX_PINS} pages to pin them to the top of the menu.
        </p>
      </div>
    </div>
  );
}
