// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { isArchivePath } from '../src/utils/archive-mode.js';
import { useUIStore } from '../src/stores/ui-store.js';
import { DEFAULT_STORE_ID } from '@lolas/shared';

describe('archived store workspace', () => {
  beforeEach(() => {
    useUIStore.setState({ selectedStoreId: null, archiveMode: false, archivedStoreName: null });
  });

  it('allows only the approved historical routes', () => {
    expect(isArchivePath('/orders/completed')).toBe(true);
    expect(isArchivePath('/accounts/asset-cash')).toBe(true);
    expect(isArchivePath('/analytics')).toBe(true);
    expect(isArchivePath('/dashboard')).toBe(false);
    expect(isArchivePath('/orders/active')).toBe(false);
    expect(isArchivePath('/settings')).toBe(false);
  });

  it('enters and exits archive mode without leaving a stale store selection', () => {
    useUIStore.getState().enterArchiveMode('store-bass', 'Bass Bikes');
    expect(useUIStore.getState()).toMatchObject({
      selectedStoreId: 'store-bass',
      archiveMode: true,
      archivedStoreName: 'Bass Bikes',
    });
    useUIStore.getState().exitArchiveMode();
    expect(useUIStore.getState()).toMatchObject({
      selectedStoreId: DEFAULT_STORE_ID,
      archiveMode: false,
      archivedStoreName: null,
    });
  });
});
