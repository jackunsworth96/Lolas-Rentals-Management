const TIMEZONE = 'Asia/Manila';

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-PH', { timeZone: TIMEZONE });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-PH', { timeZone: TIMEZONE });
}

export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString('en-PH', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' });
}

/** Short month + day + time in Manila, e.g. "Apr 6, 09:15 AM" */
export function formatPickupDatetimeManila(date: string | Date): string {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: TIMEZONE,
  });
}

export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function today(): string {
  return toISODate(new Date());
}

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
