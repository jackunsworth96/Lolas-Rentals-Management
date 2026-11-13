import { useState } from 'react';

/** Order reference shown as a distinct chip next to the customer name; click to copy. */
export function OrderRefChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Click to copy order reference"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-3 inline-flex items-center rounded-md border border-teal-brand/30 bg-teal-50 px-2 py-0.5 align-middle font-mono text-sm font-semibold tracking-wide text-teal-brand hover:bg-teal-100"
    >
      {copied ? 'Copied ✓' : value}
    </button>
  );
}
