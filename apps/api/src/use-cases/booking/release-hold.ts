import type { BookingPort } from '@lolas/domain';

export interface ReleaseHoldInput {
  holdId: string;
  sessionToken: string;
}

export interface ReleaseHoldDeps {
  bookingPort: BookingPort;
}

export async function releaseHold(
  deps: ReleaseHoldDeps,
  input: ReleaseHoldInput,
): Promise<boolean> {
  if (!input.holdId || !input.sessionToken) {
    throw new Error('holdId and sessionToken are required');
  }

  return deps.bookingPort.deleteHold(input.holdId, input.sessionToken);
}
