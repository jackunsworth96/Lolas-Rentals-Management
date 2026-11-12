import { firstName } from '../../lib/first-name.js';
import { escapeHtml } from '../email.js';

function layout(body: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #00577C; padding: 32px; text-align: center;">
        <img src="https://res.cloudinary.com/dk3c78pro/image/upload/f_png,w_220/v1777351847/Lolas_Original_Logo_tnqhii.svg"
             alt="Lola's Rentals"
             width="220"
             style="display: block; margin: 0 auto; height: auto;" />
      </div>
      <div style="padding: 32px; background: #FAF6F0; color: #363737; line-height: 1.6;">
        ${body}
      </div>
    </div>
  `;
}

function messageBlock(message: string | null | undefined): string {
  if (!message?.trim()) return '';
  return `<p style="margin: 0 0 24px; white-space: pre-line;">${escapeHtml(message)}</p>`;
}

export function contractSigningRequestHtml({
  recipientName,
  title,
  signingUrl,
  lolaSignerName,
  expiresAt,
}: {
  recipientName: string;
  title: string;
  signingUrl: string;
  lolaSignerName: string;
  expiresAt: string;
}): string {
  return layout(`
    <h2 style="margin: 0 0 8px;">Hi ${escapeHtml(firstName(recipientName))},</h2>
    <p style="margin: 0 0 24px;">
      ${escapeHtml(lolaSignerName)} from Lola's Rentals has sent you <strong>${escapeHtml(title)}</strong> to review and sign.
    </p>
    <p style="text-align: center; margin: 32px 0;">
      <a href="${escapeHtml(signingUrl)}"
         style="display: inline-block; background: #FCBC5A; color: #363737; font-weight: 700; padding: 14px 28px; border-radius: 12px; border: 2px solid #363737; text-decoration: none;">
        Review and sign
      </a>
    </p>
    <p style="font-size: 13px; color: #666; margin: 0;">
      This link is personal to you and expires on ${escapeHtml(expiresAt)}. Once both sides have signed, you'll receive a PDF copy by email.
    </p>
  `);
}

export function contractCompletedHtml({
  recipientName,
  title,
  signedAt,
  message,
}: {
  recipientName: string;
  title: string;
  signedAt: string;
  message?: string | null;
}): string {
  return layout(`
    <h2 style="margin: 0 0 8px;">Hi ${escapeHtml(firstName(recipientName))},</h2>
    ${messageBlock(message)}
    <p style="margin: 0 0 24px;">
      Attached is the signed copy of <strong>${escapeHtml(title)}</strong>${signedAt ? `, signed on ${escapeHtml(signedAt)}` : ''}.
      Please keep it for your records.
    </p>
    <p style="font-size: 13px; color: #666; margin: 0;">Lola's Rentals</p>
  `);
}
