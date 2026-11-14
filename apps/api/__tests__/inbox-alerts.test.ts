import { describe, expect, it } from 'vitest';
import { buildInboxAlerts, type InboxAlertRow } from '../src/lib/inbox-alerts.js';

const nowMs = Date.parse('2026-11-14T12:00:00+08:00');
const dayStartMs = Date.parse('2026-11-14T00:00:00+08:00');

function row(overrides: Partial<InboxAlertRow>): InboxAlertRow {
  return {
    id: 'r1', order_reference: 'LR-1', customer_name: 'Guest', customer_mobile: null,
    created_at: '2026-11-14T11:50:00+08:00', pickup_datetime: '2026-11-20T09:00:00+08:00',
    vehicle_model_id: null, pickup_location_id: null, pickup_location_address: null, customer_extra_comments: null,
    ...overrides,
  };
}

describe('buildInboxAlerts', () => {
  it('alerts on orders that arrived in the last day until they are acknowledged', () => {
    const rows = [row({ id: 'fresh' }), row({ id: 'old', created_at: '2026-11-13T09:00:00+08:00' })];
    expect(buildInboxAlerts({ rows, acknowledged: new Set(), nowMs, dayStartMs }).map((a) => [a.row.id, a.type])).toEqual([
      ['fresh', 'new_order'],
    ]);
    expect(buildInboxAlerts({ rows, acknowledged: new Set(['fresh:new_order']), nowMs, dayStartMs })).toEqual([]);
  });

  it('alerts on unactivated orders from an hour before pickup, including late ones, instead of the new-order alert', () => {
    const rows = [
      row({ id: 'soon', pickup_datetime: '2026-11-14T12:45:00+08:00' }),
      row({ id: 'late', created_at: '2026-11-10T09:00:00+08:00', pickup_datetime: '2026-11-14T10:00:00+08:00' }),
      row({ id: 'later', created_at: '2026-11-10T09:00:00+08:00', pickup_datetime: '2026-11-14T13:30:00+08:00' }),
    ];
    const alerts = buildInboxAlerts({ rows, acknowledged: new Set(), nowMs, dayStartMs });
    expect(alerts.map((a) => [a.row.id, a.type, a.eventDatetime])).toEqual([
      ['soon', 'activation_due', '2026-11-14T12:45:00+08:00'],
      ['late', 'activation_due', '2026-11-14T10:00:00+08:00'],
    ]);
  });

  it('stays quiet once the activation alert has been marked prepared', () => {
    const rows = [row({ id: 'soon', pickup_datetime: '2026-11-14T12:45:00+08:00' })];
    expect(buildInboxAlerts({ rows, acknowledged: new Set(['soon:activation_due']), nowMs, dayStartMs })).toEqual([]);
  });
});
