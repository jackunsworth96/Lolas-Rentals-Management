import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Optional actions rendered on the title row, left of the close button. */
  headerActions?: React.ReactNode;
  /** Pinned below the scrolling body, so primary actions stay visible on long content. */
  footer?: React.ReactNode;
  /** Below the `sm` breakpoint the dialog fills the whole screen. */
  fullScreenOnMobile?: boolean;
}

const SIZE_CLASSES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', '2xl': 'max-w-6xl' };

export function Modal({ open, onClose, title, children, size = 'md', headerActions, footer, fullScreenOnMobile = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pinnedLayout = footer !== undefined || fullScreenOnMobile;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const layoutClasses = pinnedLayout ? 'max-h-[90vh] flex-col overflow-hidden open:flex' : '';
  const mobileClasses = fullScreenOnMobile
    ? 'max-sm:m-0 max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none'
    : '';
  const edgePadding = fullScreenOnMobile ? 'px-4 sm:px-6' : 'px-6';

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`${SIZE_CLASSES[size]} w-full rounded-xl border-0 bg-white p-0 shadow-xl backdrop:bg-black/50 ${layoutClasses} ${mobileClasses}`}
    >
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 ${edgePadding} py-4`}>
        <h2 className="min-w-0 truncate text-lg font-semibold text-gray-900">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          {headerActions}
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className={pinnedLayout ? `min-h-0 flex-1 overflow-y-auto ${edgePadding} py-4` : 'px-6 py-4'}>{children}</div>
      {footer !== undefined && (
        <div className={`shrink-0 border-t border-gray-200 bg-white ${edgePadding} pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]`}>
          {footer}
        </div>
      )}
    </dialog>
  );
}
