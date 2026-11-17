import { useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, Search, Star, X } from 'lucide-react';
import { useUIStore } from '../../stores/ui-store.js';
import { isStaffUser, useAuthStore } from '../../stores/auth-store.js';
import { useNavPrefsStore, usePins } from '../../stores/nav-prefs-store.js';
import { useUnseenTaskCount } from '../../api/todo.js';
import { usePendingStaffRequestCount, usePortalSummary } from '../../api/me.js';
import lolasLogo from '../../assets/Lolas Original Logo.svg';
import { isArchivePath } from '../../utils/archive-mode.js';
import {
  ALL_NAV_ITEMS,
  MAX_PINS,
  NAV_GROUPS,
  SETTINGS_ITEM,
  activeNavPath,
  hasNavPermission,
  navPermissions,
  type NavItem,
} from './nav-config.js';

export function Sidebar() {
  const open = useUIStore((s) => s.sidebarOpen);
  const archiveMode = useUIStore((s) => s.archiveMode);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const closeSidebarOnMobile = useUIStore((s) => s.closeSidebarOnMobile);
  const setCommandOpen = useUIStore((s) => s.setCommandOpen);
  const user = useAuthStore((s) => s.user);
  const perms = useMemo(() => navPermissions(user), [user]);
  const employeeId = user?.employeeId ?? '';
  const isStaff = isStaffUser(user);
  const collapsedGroups = useNavPrefsStore((s) => s.collapsedGroups);
  const toggleGroup = useNavPrefsStore((s) => s.toggleGroup);
  const { pins, togglePin } = usePins();
  const { pathname } = useLocation();
  const activePath = activeNavPath(pathname);

  const { data: unseenData } = useUnseenTaskCount(employeeId);
  const todoCount = (unseenData as { count?: number } | undefined)?.count ?? 0;
  const { data: portal } = usePortalSummary(!!employeeId && isStaff && !archiveMode);
  const toSign = portal?.payslipsToSign ?? 0;
  const storeId = useUIStore((s) => s.selectedStoreId) ?? '';
  const canReviewRequests = perms.includes('can_view_payroll') && perms.includes('can_approve_staff_requests');
  const pendingRequests = usePendingStaffRequestCount(storeId, canReviewRequests && !archiveMode);

  const isVisible = (item: NavItem) =>
    hasNavPermission(item.perm, perms) && (!archiveMode || isArchivePath(item.path));
  const pinnedItems = archiveMode
    ? []
    : pins.map((p) => ALL_NAV_ITEMS.find((i) => i.path === p)!).filter(isVisible);
  const pinsFull = pins.length >= MAX_PINS;

  function badge(item: NavItem) {
    if (!open) return null;
    if (item.path === '/todo' && todoCount > 0) {
      return (
        <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {todoCount > 99 ? '99+' : todoCount}
        </span>
      );
    }
    if (item.path === '/me' && toSign > 0) {
      return (
        <span className="ml-auto rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Payslips to sign">
          {toSign}
        </span>
      );
    }
    if (item.path === '/hr/payroll' && pendingRequests > 0) {
      return (
        <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Pending staff requests">
          {pendingRequests > 99 ? '99+' : pendingRequests}
        </span>
      );
    }
    return null;
  }

  function renderItem(item: NavItem, keyPrefix = '') {
    const isActive = activePath === item.path;
    const pinned = pins.includes(item.path);
    const canPin = open && !archiveMode && (pinned || !pinsFull);
    return (
      <div key={keyPrefix + item.path} className="group relative">
        <NavLink
          to={item.path}
          title={!open ? item.label : undefined}
          onClick={closeSidebarOnMobile}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? 'bg-teal-50 text-teal-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {open && <span className="truncate">{item.label}</span>}
          {badge(item)}
        </NavLink>
        {canPin && (
          <button
            type="button"
            onClick={() => togglePin(item.path)}
            className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-white hover:text-amber-500 md:group-hover:block"
            aria-label={pinned ? `Unpin ${item.label}` : `Pin ${item.label}`}
            title={pinned ? 'Unpin' : 'Pin to top'}
          >
            <Star className={`h-3.5 w-3.5 ${pinned ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[55] bg-black/30 md:hidden" onClick={toggleSidebar} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-[60] flex flex-col overflow-hidden border-r border-gray-200 bg-white transition-all ${
          open ? 'w-64 md:w-52' : 'w-0 md:w-16'
        }`}
      >
        {/* Logo */}
        <div className="relative flex h-16 shrink-0 items-center justify-center border-b border-gray-100 px-4">
          <img
            src={lolasLogo}
            alt="Lola's Rentals"
            className={open ? 'h-10 w-auto object-contain' : 'h-8 w-8 object-contain'}
          />
          <button
            type="button"
            onClick={toggleSidebar}
            className="absolute right-3 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Quick search */}
        <div className="shrink-0 px-2 pt-3">
          <button
            type="button"
            onClick={() => {
              closeSidebarOnMobile();
              setCommandOpen(true);
            }}
            title={!open ? 'Search pages (Ctrl+K)' : undefined}
            className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-600"
          >
            <Search className="h-4 w-4 shrink-0" />
            {open && (
              <>
                <span>Search…</span>
                <kbd className="ml-auto hidden rounded border border-gray-200 px-1 text-[10px] md:inline">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-2">
          {open && pinnedItems.length > 0 && (
            <div className="mb-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Pinned</p>
              {pinnedItems.map((item) => renderItem(item, 'pin-'))}
            </div>
          )}

          {NAV_GROUPS.map((group) => {
            const items = group.items.filter(isVisible);
            if (items.length === 0) return null;
            const containsActive = items.some((i) => i.path === activePath);
            const collapsed = open && !!collapsedGroups[group.label] && !containsActive;

            return (
              <div key={group.label}>
                {open ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={!collapsed}
                    className="flex w-full items-center justify-between rounded px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400 hover:text-gray-600"
                  >
                    {group.label}
                    <ChevronDown className={`h-3 w-3 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                  </button>
                ) : (
                  <div className="mx-3 my-1 h-px bg-gray-100" />
                )}
                {!collapsed && items.map((item) => renderItem(item))}
              </div>
            );
          })}
        </nav>

        {isVisible(SETTINGS_ITEM) && (
          <div className="shrink-0 border-t border-gray-100 px-2 py-2">{renderItem(SETTINGS_ITEM)}</div>
        )}
      </aside>
    </>
  );
}
