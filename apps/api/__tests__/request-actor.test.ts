import { afterEach, expect, it, vi } from 'vitest';
import { actorFetch, runWithActor } from '../src/adapters/supabase/request-actor.js';

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const calls: Headers[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: unknown, init?: RequestInit) => {
    calls.push(new Headers(init?.headers));
    return new Response('{}');
  }));
  return calls;
}

it('tags database requests with the staff member behind the API request', async () => {
  const calls = stubFetch();
  await runWithActor({ employeeId: 'EMP7', userId: 'user-7' }, () =>
    actorFetch('https://db.example/rest/v1/waivers', { headers: { apikey: 'k' } }));
  expect(calls[0].get('x-actor-employee-id')).toBe('EMP7');
  expect(calls[0].get('x-actor-user-id')).toBe('user-7');
  expect(calls[0].get('apikey')).toBe('k');
});

it('keeps the actor across awaits and leaves requests outside a request untagged', async () => {
  const calls = stubFetch();
  await runWithActor({ employeeId: 'EMP1' }, async () => {
    await new Promise((r) => setTimeout(r, 1));
    await actorFetch('https://db.example/a', {});
  });
  await actorFetch('https://db.example/b', {});
  expect(calls[0].get('x-actor-employee-id')).toBe('EMP1');
  expect(calls[1].get('x-actor-employee-id')).toBeNull();
});
