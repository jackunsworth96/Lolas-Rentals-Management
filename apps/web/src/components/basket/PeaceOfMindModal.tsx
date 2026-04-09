import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import peaceOfMindIcon from '../../assets/Basket/Peace of Mind.svg';

const COVERED_ITEMS = [
  'Scratches and small dents on the scooter body or frame',
  'Broken panels, mirrors, and handles',
  'Tyre or wheel damage, including flats from regular wear and tear',
  "Theft protection, provided the loss isn't due to user oversight",
  'Damage to included accessories',
  'Vandalism caused by the public',
] as const;

const NOT_COVERED_ITEMS = [
  'Damage resulting from reckless, negligent, or improper use',
  'Structural damage to the frame, such as the t-post or chassis',
  'Loss of the scooter, key, or accessories due to avoidable circumstances',
  'Personal injuries or third-party liabilities',
] as const;

export interface PeaceOfMindModalProps {
  open: boolean;
  onClose: () => void;
}

export function PeaceOfMindModal({ open, onClose }: PeaceOfMindModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="peace-of-mind-modal-root"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 sm:px-6 md:px-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="peace-of-mind-modal-title"
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-cream-brand p-6 shadow-lg md:max-h-[90vh] md:max-w-3xl md:p-8 lg:max-w-4xl"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <button
                type="button"
                onClick={onClose}
                className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-lg text-charcoal-brand transition-colors hover:bg-charcoal-brand/10 hover:text-teal-brand"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>

              <div className="flex items-center gap-3 pr-10">
                <img
                  src={peaceOfMindIcon}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 object-contain"
                  aria-hidden
                />
                <h2 id="peace-of-mind-modal-title" className="font-headline text-xl text-teal-brand">
                  Peace of Mind Cover
                </h2>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:items-start">
              <div className="rounded-xl bg-teal-brand/10 p-4">
                <p className="mb-3 font-lato font-semibold text-teal-brand">✓ What&apos;s covered</p>
                <ul className="space-y-2 pl-0 font-lato text-sm leading-snug text-charcoal-brand/90">
                  {COVERED_ITEMS.map((text) => (
                    <li key={text} className="flex gap-2">
                      <span className="shrink-0 text-teal-brand" aria-hidden>
                        •
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-red-50 p-4">
                <p className="mb-3 font-lato font-semibold text-red-700">✗ Not covered</p>
                <ul className="space-y-2 pl-0 font-lato text-sm leading-snug text-charcoal-brand/90">
                  {NOT_COVERED_ITEMS.map((text) => (
                    <li key={text} className="flex gap-2">
                      <span className="shrink-0 text-red-700" aria-hidden>
                        •
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-6">
              <a
                href="/peace-of-mind"
                target="_blank"
                rel="noopener noreferrer"
                className="font-lato text-xs text-teal-brand underline"
              >
                View full details
              </a>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 w-full rounded-lg border-2 border-teal-brand py-2 font-lato font-bold text-teal-brand transition-colors hover:bg-teal-brand/5"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
