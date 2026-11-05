import { AsyncLocalStorage } from 'node:async_hooks';

/** The staff member behind the current API request, recorded by the audit_log triggers. */
export interface RequestActor {
  employeeId?: string;
  userId?: string;
}

const storage = new AsyncLocalStorage<RequestActor>();

export function runWithActor<T>(actor: RequestActor, fn: () => T): T {
  return storage.run(actor, fn);
}

export function currentActor(): RequestActor | undefined {
  return storage.getStore();
}

/** fetch for the Supabase client that tags each request with the current actor. */
export const actorFetch: typeof fetch = (input, init) => {
  const actor = storage.getStore();
  if (!actor?.employeeId && !actor?.userId) return fetch(input, init);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  if (actor.employeeId) headers.set('x-actor-employee-id', actor.employeeId);
  if (actor.userId) headers.set('x-actor-user-id', actor.userId);
  return fetch(input, { ...init, headers });
};
