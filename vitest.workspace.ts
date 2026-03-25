import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/domain',
  'packages/shared',
  'apps/api',
  'apps/web',
]);
