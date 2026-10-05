import { expect, it } from 'vitest';
import { walkInReservationConfirmationHtml } from '../src/services/email-templates/customer.js';

it('includes the reservation waiver link and pickup fallback in the confirmation email', () => {
  const html = walkInReservationConfirmationHtml({
    customerName: 'Maria Santos',
    orderReference: 'LR-1005-1234',
    vehicleName: 'Honda Click',
    pickupDatetime: 'Oct 6, 2026, 9:00 AM',
    dropoffDatetime: 'Oct 7, 2026, 9:00 AM',
    pickupLocation: 'Store',
    dropoffLocation: 'Store',
    waiverUrl: 'https://lolasrentals.com/waiver/LR-1005-1234?source=email&reservation=true',
    whatsappNumber: '639694443413',
  });

  expect(html).toContain('href="https://lolasrentals.com/waiver/LR-1005-1234?source=email&amp;reservation=true"');
  expect(html).toContain('Complete My Waiver');
  expect(html).toContain('use this same link or ask our staff for help');
  expect(html).toContain('Pending Activation');
});
