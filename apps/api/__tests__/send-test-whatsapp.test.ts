import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { sendTestWhatsApp } from '../scripts/send-test-whatsapp.js';

const mocks = vi.hoisted(() => ({ send: vi.fn(), getSupabaseClient: vi.fn() }));
vi.mock('../src/adapters/supabase/client.js', () => ({ getSupabaseClient: mocks.getSupabaseClient }));
vi.mock('../src/services/whatsapp-template.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/services/whatsapp-template.js')>(), sendWhatsAppTemplate: mocks.send,
}));
const originalEnv = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); process.env = { ...originalEnv }; });

it('previews by default and requires an explicit send flag', async () => {
  process.env.NODE_ENV = 'development';
  await sendTestWhatsApp(['+639171234567', 'Ada', '9:00 AM']);
  expect(mocks.send).not.toHaveBeenCalled();
  expect(mocks.getSupabaseClient).not.toHaveBeenCalled();
  expect(process.env.NODE_ENV).toBe('development');
  await expect(sendTestWhatsApp(['not-a-phone', '--send'])).rejects.toThrow('Usage:');
  await expect(sendTestWhatsApp(['+639171234567', '--key', ' ', '--send'])).rejects.toThrow('Usage:');
});

it.each([
  { args: [], operationKey: 'manual-test:pickup-reminder:+639171234567', reportedAt: '2026-10-31T02:00:00Z' },
  { args: ['--key', 'new-account-1'], operationKey: 'manual-test:pickup-reminder:+639171234567:new-account-1', reportedAt: '2026-10-31T02:00:00Z' },
  { args: ['--key', 'pending'], operationKey: 'manual-test:pickup-reminder:+639171234567:pending', reportedAt: null },
])('uses the stable test key $operationKey and prints the saved Meta ID and report status', async ({ args, operationKey, reportedAt }) => {
  process.env.NODE_ENV = 'development';
  const single = vi.fn().mockResolvedValue({ data: { external_message_id: 'wamid.test', reported_at: reportedAt }, error: null });
  const eq = vi.fn(() => ({ single }));
  mocks.getSupabaseClient.mockReturnValue({ from: () => ({ select: () => ({ eq }) }) });
  await sendTestWhatsApp(['+639171234567', 'Ada', '9:00 AM', '--send', ...args]);
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
    operationKey, phone: '+639171234567',
    parameters: ['Ada', '9:00 AM'],
  }));
  expect(process.env.NODE_ENV).toBe('production');
  expect(eq).toHaveBeenCalledWith('operation_key', operationKey);
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('wamid.test'));
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining(reportedAt ? 'LoloDesk confirmed the report' : 'same database as this test'));
});
