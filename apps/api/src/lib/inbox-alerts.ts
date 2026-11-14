/** New web orders keep alerting until acknowledged, for up to a day after they arrive. */
export const NEW_ORDER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Unactivated orders start alerting this long before pickup. */
export const ACTIVATION_LEAD_MS = 60 * 60 * 1000;

export type InboxAlertType = 'new_order' | 'activation_due';

export interface InboxAlertRow {
  id: string;
  order_reference: string | null;
  customer_name: string | null;
  customer_mobile: string | null;
  created_at: string;
  pickup_datetime: string | null;
  vehicle_model_id: string | null;
  pickup_location_id: number | string | null;
  pickup_location_address: string | null;
  customer_extra_comments: string | null;
}

export interface InboxAlert {
  type: InboxAlertType;
  row: InboxAlertRow;
  /** When the order arrived (new_order) or when the customer is due to pick up (activation_due). */
  eventDatetime: string;
}

/**
 * One alert per unprocessed order at most: an order that is both new and due
 * for pickup shows only the more urgent activation alert.
 */
export function buildInboxAlerts(input: {
  rows: InboxAlertRow[];
  /** `${order_raw_id}:${event_type}` for every acknowledged alert. */
  acknowledged: Set<string>;
  nowMs: number;
  dayStartMs: number;
}): InboxAlert[] {
  const { nowMs, dayStartMs, acknowledged } = input;
  const alerts: InboxAlert[] = [];
  for (const row of input.rows) {
    const pickupMs = row.pickup_datetime ? new Date(row.pickup_datetime).getTime() : NaN;
    const activationDue = pickupMs >= dayStartMs && pickupMs <= nowMs + ACTIVATION_LEAD_MS;
    if (activationDue) {
      if (!acknowledged.has(`${row.id}:activation_due`)) {
        alerts.push({ type: 'activation_due', row, eventDatetime: row.pickup_datetime! });
      }
      continue;
    }
    const isNew = new Date(row.created_at).getTime() >= nowMs - NEW_ORDER_LOOKBACK_MS;
    if (isNew && !acknowledged.has(`${row.id}:new_order`)) {
      alerts.push({ type: 'new_order', row, eventDatetime: row.created_at });
    }
  }
  return alerts;
}
