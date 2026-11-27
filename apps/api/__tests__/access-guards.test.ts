import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { Permission } from '@lolas/shared';
import { assertKeepsOwnAccessManagement, assertNoEscalation, mapAccessDbError } from '../src/lib/access-guards.js';

const reqWith = (permissions: string[]) => ({ user: { permissions } }) as unknown as Request;

describe('assertNoEscalation', () => {
  it('allows giving out permissions the actor holds', () => {
    expect(() => assertNoEscalation(reqWith([Permission.ViewFleet, Permission.EditFleet]), [Permission.EditFleet])).not.toThrow();
  });

  it('blocks giving out anything the actor lacks', () => {
    try {
      assertNoEscalation(reqWith([Permission.ViewFleet]), [Permission.EditFleet]);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ statusCode: 403, code: 'ESCALATION_BLOCKED' });
    }
  });
});

describe('assertKeepsOwnAccessManagement', () => {
  it('blocks self-lockout', () => {
    expect(() => assertKeepsOwnAccessManagement(false)).toThrow(expect.objectContaining({ statusCode: 409, code: 'SELF_LOCKOUT' }));
    expect(() => assertKeepsOwnAccessManagement(true)).not.toThrow();
  });
});

describe('mapAccessDbError', () => {
  it.each([
    ['VERSION_CONFLICT', 409],
    ['LAST_ACCESS_MANAGER', 409],
    ['ROLE_NOT_FOUND', 404],
    ['UNKNOWN_PERMISSION', 400],
  ])('maps the %s hint to %i', (hint, status) => {
    expect(mapAccessDbError({ hint, message: 'x' }, 'fail')).toMatchObject({ statusCode: status, code: hint });
  });

  it('reports a missing migration as 503', () => {
    expect(mapAccessDbError({ code: 'PGRST202' }, 'fail')).toMatchObject({ statusCode: 503, code: 'MIGRATION_PENDING' });
    expect(mapAccessDbError({ code: '42P01' }, 'fail')).toMatchObject({ statusCode: 503 });
  });

  it('falls back to 500', () => {
    expect(mapAccessDbError({ message: 'boom' }, 'Could not save')).toMatchObject({ statusCode: 500, message: 'Could not save: boom' });
  });
});
