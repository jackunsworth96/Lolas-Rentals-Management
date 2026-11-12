import { describe, expect, it } from 'vitest';
import { firstName } from '../src/lib/first-name.js';
import { waiverConfirmationHtml, waiverReminderHtml } from '../src/services/email-templates/customer.js';

describe('first-name greetings', () => {
  it.each([
    ['Alfie Magwood', 'Alfie'],
    ['  Alfie\t Magwood  ', 'Alfie'],
    ['Alfie', 'Alfie'],
    ["Anne-Marie O'Neill", 'Anne-Marie'],
    ['李 明', '李'],
    ['   ', 'there'],
  ])('uses the first word of %j', (name, expected) => {
    expect(firstName(name)).toBe(expected);
  });

  it('shortens email greetings and keeps HTML escaping', () => {
    const html = waiverReminderHtml({
      customerName: '<Alfie> Magwood', orderReference: 'LR-1',
      pickupDatetime: 'Tomorrow', waiverUrl: 'https://example.com/waiver', whatsappNumber: '639171234567',
    });
    expect(html).toContain('Action Required, &lt;Alfie&gt;!');
    expect(html).not.toContain('Magwood');
  });

  it('keeps the full signer name in the waiver record', () => {
    const html = waiverConfirmationHtml({
      driverName: 'Alfie Magwood', orderReference: 'LR-1', signedAt: 'Today',
      hasLicence: true, whatsappNumber: '639171234567', waiverAgreementUrl: 'https://example.com/waiver',
    });
    expect(html).toContain('Waiver Signed, Alfie!');
    expect(html).toContain('Alfie Magwood</td>');
  });
});
