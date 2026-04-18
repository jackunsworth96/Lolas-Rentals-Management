import { createHash } from 'node:crypto';
import { escapeHtml } from '../email.js';

export function maintenanceLogHtml(
  r: {
    id: string;
    vehicleName: string | null;
    issueDescription: string | null;
    mechanic: string | null;
    odometer: number | null;
    partsCost: number;
    laborCost: number;
    totalCost: number;
    downtimeStart: string | null;
    storeId: string;
    createdAt: Date;
  },
  {
    plateNumber,
    engineNumber,
    chassisNumber,
  }: {
    plateNumber: string;
    engineNumber: string;
    chassisNumber: string;
  },
): string {
  const createdAt = r.createdAt.toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Tamper-evident hash: any post-send edit to vehicle identity fields will invalidate it.
  const hashContent = [
    r.id,
    r.vehicleName ?? '',
    plateNumber,
    r.issueDescription ?? '',
    createdAt,
  ].join('|');
  const hash = createHash('sha256').update(hashContent).digest('hex').slice(0, 16).toUpperCase();

  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">

      <div style="background: #1e293b; padding: 28px 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: 0.04em;">
          🔧 Maintenance Log
        </h1>
        <p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">
          Lola's Rentals · Internal Record
        </p>
      </div>

      <div style="background: #f8fafc; padding: 28px 32px;">

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Vehicle Identity
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 160px;">Vehicle</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.vehicleName ?? '—')}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Plate Number</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(plateNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Engine Number</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(engineNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Chassis Number</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(chassisNumber)}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Maintenance Details
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 160px;">Record ID</td>
              <td style="padding: 7px 0; color: #475569; font-size: 12px; font-family: monospace;">${escapeHtml(r.id)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Logged At</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(createdAt)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Issue</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.issueDescription ?? '—')}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Mechanic</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.mechanic ?? '—')}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Odometer</td>
              <td style="padding: 7px 0; color: #1e293b;">${r.odometer != null ? `${r.odometer.toLocaleString()} km` : '—'}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Downtime Start</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.downtimeStart ?? '—')}</td>
            </tr>
            <tr style="border-top: 1px solid #f1f5f9;">
              <td style="padding: 10px 0 7px; color: #64748b;">Parts Cost</td>
              <td style="padding: 10px 0 7px; color: #1e293b;">₱${r.partsCost.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Labour Cost</td>
              <td style="padding: 7px 0; color: #1e293b;">₱${r.laborCost.toLocaleString()}</td>
            </tr>
            <tr style="border-top: 2px solid #e2e8f0;">
              <td style="padding: 10px 0 7px; color: #64748b; font-weight: 700;">Total Cost</td>
              <td style="padding: 10px 0 7px; font-weight: 700; color: #1e293b; font-size: 16px;">₱${r.totalCost.toLocaleString()}</td>
            </tr>
          </table>
        </div>

        <div style="background: #f1f5f9; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.7;">
            <strong style="color: #475569;">Tamper-evident hash:</strong>
            <span style="font-family: monospace; letter-spacing: 0.06em;">${hash}</span>
            &nbsp;·&nbsp; This hash is derived from the record ID, vehicle name, plate number, issue description,
            and log timestamp. Any post-submission change to these fields will cause verification to fail.
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
          Lola's Rentals &amp; Tours Inc. — Internal use only. Do not forward externally.
        </p>

      </div>
    </div>
  `;
}

export function inspectionLogHtml({
  inspectionId,
  orderReference,
  vehicleName,
  plateNumber,
  engineNumber,
  chassisNumber,
  kmReading,
  damageNotes,
  helmetNumbers,
  hasCustomerSignature,
  storeId,
  loggedAt,
  results,
  contentHash,
}: {
  inspectionId: string;
  orderReference: string;
  vehicleName: string;
  plateNumber: string;
  engineNumber: string;
  chassisNumber: string;
  kmReading?: string;
  damageNotes?: string;
  helmetNumbers?: string;
  hasCustomerSignature: boolean;
  storeId: string;
  loggedAt: string;
  results: Array<{
    itemName: string;
    result: string;
    qty?: number;
    notes?: string;
  }>;
  contentHash: string;
}): string {
  const issueItems = results.filter((r) => r.result === 'issue_noted');
  const acceptedCount = results.filter((r) => r.result === 'accepted').length;

  const resultLabel = (r: string) => {
    switch (r) {
      case 'accepted': return '✅ Accepted';
      case 'issue_noted': return '⚠️ Issue Noted';
      case 'na': return '— N/A';
      case 'declined': return '❌ Declined';
      default: return r;
    }
  };

  const resultColor = (r: string) => {
    switch (r) {
      case 'accepted': return '#16a34a';
      case 'issue_noted': return '#d97706';
      case 'declined': return '#dc2626';
      default: return '#64748b';
    }
  };

  return `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto;">

      <div style="background: #1e293b; padding: 24px 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">
          🔍 Vehicle Inspection Record
        </h1>
        <p style="color: rgba(255,255,255,0.6); margin: 6px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">
          Lola's Rentals · Tamper-Evident Legal Record
        </p>
      </div>

      <div style="background: #f8fafc; padding: 28px 32px;">

        <div style="background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 12px; color: #92400E; line-height: 1.7;">
            ⚠️ This is an automated tamper-evident record generated at the moment of inspection submission.
            Any discrepancy between this email and the database record may indicate unauthorised modification.
          </p>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Inspection Details
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 180px;">Inspection ID</td>
              <td style="padding: 7px 0; font-family: monospace; font-size: 12px; color: #475569;">${escapeHtml(inspectionId)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Logged At</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(loggedAt)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Order Reference</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(orderReference)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Store</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(storeId)}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Vehicle Identity
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 180px;">Vehicle</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(vehicleName)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Plate Number</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(plateNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Engine Number</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(engineNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Chassis Number</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(chassisNumber)}</td>
            </tr>
            ${kmReading ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b;">KM Reading</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(kmReading)} km</td>
            </tr>` : ''}
            ${helmetNumbers ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Helmet Numbers</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(helmetNumbers)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Customer Signature</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${hasCustomerSignature ? '#16a34a' : '#dc2626'};">
                ${hasCustomerSignature ? '✅ Captured' : '❌ Not captured'}
              </td>
            </tr>
          </table>
        </div>

        ${damageNotes ? `
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
          <p style="font-size: 12px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">
            ⚠️ Damage Notes
          </p>
          <p style="color: #7F1D1D; font-size: 14px; margin: 0; line-height: 1.6;">${escapeHtml(damageNotes)}</p>
        </div>` : ''}

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Inspection Checklist (${acceptedCount} accepted, ${issueItems.length} issues)
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${results.map((r) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 7px 0; color: #475569; width: 55%;">
                ${escapeHtml(r.itemName)}${r.qty ? ` (×${r.qty})` : ''}
              </td>
              <td style="padding: 7px 0; font-weight: 600; color: ${resultColor(r.result)};">
                ${resultLabel(r.result)}
              </td>
            </tr>
            ${r.notes ? `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td colspan="2" style="padding: 4px 0 8px; padding-left: 12px; font-size: 12px; color: #d97706; font-style: italic;">
                Note: ${escapeHtml(r.notes)}
              </td>
            </tr>` : ''}
            `).join('')}
          </table>
        </div>

        <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0 0 6px; font-family: monospace;">
            TAMPER-EVIDENT HASH (SHA-256)
          </p>
          <p style="color: #FCBC5A; font-size: 12px; margin: 0; font-family: monospace; word-break: break-all;">
            ${escapeHtml(contentHash)}
          </p>
          <p style="color: #64748b; font-size: 10px; margin: 8px 0 0; line-height: 1.6;">
            Hash derived from: inspection ID + order reference + vehicle name + plate number + logged at timestamp + result count.
            Any post-submission change to these fields will cause verification to fail.
          </p>
        </div>

        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">
          Lola's Rentals &amp; Tours Inc. — Internal use only. Do not forward externally.
        </p>

      </div>
    </div>
  `;
}
