import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface AttentionItem {
  id: string;
  tone: 'danger' | 'warning';
  label: string;
  to?: string;
  onClick?: () => void;
}

const TONE: Record<AttentionItem['tone'], string> = {
  danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
  warning: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
};

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span className="font-medium">All clear. Nothing needs your attention right now.</span>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Needs attention
        </span>
        {sorted.map((item) => {
          const className = `inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${TONE[item.tone]}`;
          const content = (
            <>
              {item.label}
              {(item.to || item.onClick) && <ChevronRight className="h-3 w-3" />}
            </>
          );
          if (item.to) {
            return (
              <Link key={item.id} to={item.to} className={className}>
                {content}
              </Link>
            );
          }
          if (item.onClick) {
            return (
              <button key={item.id} type="button" onClick={item.onClick} className={className}>
                {content}
              </button>
            );
          }
          return (
            <span key={item.id} className={className}>
              {content}
            </span>
          );
        })}
      </div>
    </div>
  );
}
