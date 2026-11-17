import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProtectionData } from '../src/lib/partner-protection.js';

const mocks = vi.hoisted(() => ({ loadProtectionData: vi.fn(), rpc: vi.fn() }));
vi.mock('../src/use-cases/fleet/protection-inputs.js', () => ({ loadProtectionData: mocks.loadProtectionData }));
vi.mock('../src/lib/telegram.js', () => ({ sendTelegramAlert: vi.fn(), getTelegramChatId: () => 'fleet' }));
vi.mock('../src/services/email.js', () => ({ escapeHtml: (s: string) => s }));

const { releasePartnerProtection } = await import('../src/use-cases/fleet/release-partner-protection.js');

const at = (s: string) => Date.parse(`${s}+08:00`);
const BRAVO = 'bravo';

function protection(commitments: ProtectionData['commitments']): ProtectionData & { typeOfModel: Map<string, string> } {
  return {
    enabled: true,
    partnerNames: new Map([[BRAVO, 'Bravo Beach Resort']]),
    baselines: [{ partnerId: BRAVO, vehicleType: 'bike', month: '2026-11-01', qty: 1 }],
    overrides: [],
    units: ['A', 'B', 'C'].map((vehicleId) => ({ vehicleId, vehicleType: 'bike' })),
    unavailable: [],
    commitments,
    typeOfModel: new Map(),
  };
}

const walkIn = {
  storeId: 'store-lolas', partnerId: BRAVO, vehicleType: 'bike' as const,
  startsMs: at('2026-11-17T15:15:00'), endsMs: at('2026-11-24T15:15:00'),
  reason: 'walk-in needs it', actorUserId: 'manager',
};
const otherRental = { partnerId: null, vehicleType: 'bike', pool: 'shared' as const, start: at('2026-11-10T09:00:00'), end: at('2026-11-30T09:00:00') };
const bravoGuest = { partnerId: BRAVO, vehicleType: 'bike', pool: 'guaranteed' as const, start: at('2026-11-17T15:45:00'), end: at('2026-11-20T17:15:00') };

describe('releasing a partner-protected bike', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-17T15:00:00'));
    mocks.rpc.mockReset().mockResolvedValue({ error: null });
  });
  afterEach(() => vi.useRealTimers());

  it('only lowers the allowance on the days Bravo\'s spare bike blocks the booking', async () => {
    const laterRental = { ...otherRental, start: at('2026-11-21T09:00:00') };
    mocks.loadProtectionData.mockResolvedValue(protection([otherRental, laterRental, bravoGuest]));
    const result = await releasePartnerProtection({ rpc: mocks.rpc } as never, walkIn);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1].p_data).toMatchObject({ startsOn: '2026-11-21', endsBefore: '2026-11-25', qty: 0 });
    expect(result.ranges).toEqual([{ startsOn: '2026-11-21', endsBefore: '2026-11-25', previousQty: 1, qty: 0 }]);
  });

  it('explains when Bravo\'s guest is on their bike the same day it is needed', async () => {
    const eveningRental = { ...otherRental, start: at('2026-11-20T18:00:00') };
    mocks.loadProtectionData.mockResolvedValue(protection([otherRental, eveningRental, bravoGuest]));
    await expect(releasePartnerProtection({ rpc: mocks.rpc } as never, walkIn))
      .rejects.toThrow(/own guests are using their protected bike on Fri.*20/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('says there is nothing to release when the booking already fits', async () => {
    mocks.loadProtectionData.mockResolvedValue(protection([otherRental, bravoGuest]));
    await expect(releasePartnerProtection({ rpc: mocks.rpc } as never, walkIn))
      .rejects.toThrow(/nothing to release/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
