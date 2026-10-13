import { describe, expect, it, vi } from 'vitest';
import {
  freshWaiverLicenceUrl,
  licenceUrlForStorage,
  waiverLicenceObjectPath,
} from '../src/lib/waiver-licence-url.js';

const SIGNED =
  'https://example.supabase.co/storage/v1/object/sign/waiver-documents/waiver-licence/LR-0530-EA25/front-1777000000000.jpg?token=expired';

describe('waiver licence urls', () => {
  it('reads the object path out of an expired signed url', () => {
    expect(waiverLicenceObjectPath(SIGNED)).toBe(
      'waiver-licence/LR-0530-EA25/front-1777000000000.jpg',
    );
  });

  it('keeps a stored object path and ignores signatures', () => {
    expect(waiverLicenceObjectPath('waiver-licence/LR-0530-EA25/back-1.jpg')).toBe(
      'waiver-licence/LR-0530-EA25/back-1.jpg',
    );
    expect(waiverLicenceObjectPath('data:image/png;base64,abc')).toBeNull();
    expect(waiverLicenceObjectPath(null)).toBeNull();
  });

  it('stores the object path instead of the expiring link', () => {
    expect(licenceUrlForStorage(SIGNED)).toBe(
      'waiver-licence/LR-0530-EA25/front-1777000000000.jpg',
    );
  });

  it('replaces an expired link with a newly signed url', async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/waiver-documents/fresh?token=new' },
      error: null,
    });

    const url = await freshWaiverLicenceUrl({ createSignedUrl }, SIGNED);

    expect(createSignedUrl).toHaveBeenCalledWith(
      'waiver-licence/LR-0530-EA25/front-1777000000000.jpg',
      60 * 60 * 24 * 7,
    );
    expect(url).toBe('https://example.supabase.co/storage/v1/object/sign/waiver-documents/fresh?token=new');
  });
});
