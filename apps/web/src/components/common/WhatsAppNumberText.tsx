import { AlertTriangle } from 'lucide-react';
import { formatWhatsAppNumber, isValidWhatsAppE164 } from '@lolas/shared';

interface Props {
  value: string | null | undefined;
  needsReview?: boolean;
  className?: string;
}

/** Read-only WhatsApp number: formatted when valid, red with a warning when automations can't use it. */
export function WhatsAppNumberText({ value, needsReview = false, className = '' }: Props) {
  if (!value) return null;
  if (!needsReview && isValidWhatsAppE164(value)) {
    return <span className={className}>{formatWhatsAppNumber(value)}</span>;
  }
  return (
    <span
      className={`inline-flex items-center gap-1 text-red-700 ${className}`}
      title="Invalid WhatsApp number — automated messages can't be sent. Open the order to fix it."
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {value}
    </span>
  );
}
