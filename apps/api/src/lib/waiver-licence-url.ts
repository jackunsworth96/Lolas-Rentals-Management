export const WAIVER_DOCUMENTS_BUCKET = 'waiver-documents';

/** Minted when staff open a waiver or email it. Upload-time links expire and then 400. */
export const WAIVER_LICENCE_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

const STORED_SIGNED_URL =
  /\/storage\/v1\/object\/(?:sign|public|authenticated)\/waiver-documents\/([^?#]+)/i;

export interface WaiverLicenceStorage {
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
}

export function waiverDocumentsStorage(sb: {
  storage: { from: (bucket: string) => WaiverLicenceStorage };
}): WaiverLicenceStorage {
  return sb.storage.from(WAIVER_DOCUMENTS_BUCKET);
}

/** Object path inside the waiver-documents bucket, or null when this is not one of our files. */
export function waiverLicenceObjectPath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const value = stored.trim();
  if (!value || value.startsWith('data:')) return null;

  const fromUrl = value.match(STORED_SIGNED_URL)?.[1];
  if (fromUrl) return decodeStoragePath(fromUrl);

  if (!value.includes('://') && (value.startsWith('waiver-licence/') || value.startsWith('/waiver-licence/'))) {
    return value.replace(/^\/+/, '');
  }

  return null;
}

/** Persist the object path so a later view can sign a fresh URL. Unknown values are kept as-is. */
export function licenceUrlForStorage(stored: string | null | undefined): string | null {
  if (stored == null || stored.trim() === '') return null;
  return waiverLicenceObjectPath(stored) ?? stored.trim();
}

export async function freshWaiverLicenceUrl(
  storage: WaiverLicenceStorage,
  stored: string | null | undefined,
  expiresInSeconds = WAIVER_LICENCE_URL_TTL_SECONDS,
): Promise<string | null> {
  if (stored == null || stored.trim() === '') return null;
  const path = waiverLicenceObjectPath(stored);
  if (!path) return stored;

  const { data, error } = await storage.createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return stored.includes('://') ? stored : null;
  return data.signedUrl;
}

function decodeStoragePath(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
