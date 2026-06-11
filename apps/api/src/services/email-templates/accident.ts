import { createHash } from 'node:crypto';
import { escapeHtml } from '../email.js';

export function accidentReportHtml(r: {
  id: string;
  orderReference: string;
  vehicleName: string;
  plateNumber: string;
  engineNumber: string;
  chassisNumber: string;
  customerName: string;
  accidentAt: string;
  location: string | null;
  description: string;
  damageDescription: string | null;
  customerInjured: boolean;
  injuryDescription: string | null;
  medicalAttention: boolean;
  emergencyServicesCalled: boolean;
  policeReportFiled: boolean;
  policeReportNumber: string | null;
  helmetsWorn: string | null;
  thirdPartyNotes: string | null;
  peaceOfMindActive: boolean | null;
  hasCustomerSignature: boolean;
  photoCount: number;
  reportedByName: string | null;
  storeId: string;
  createdAt: string;
  contentHash: string;
}): string {
  return `
    <div style="font-family: sans-serif; max-width: 650px; margin: 0 auto;">

      <div style="background: #7f1d1d; padding: 24px 32px; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">
          🚨 Accident Report
        </h1>
        <p style="color: rgba(255,255,255,0.7); margin: 6px 0 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">
          Lola's Rentals · Tamper-Evident Legal Record
        </p>
      </div>

      <div style="background: #f8fafc; padding: 28px 32px;">

        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 12px; color: #991B1B; line-height: 1.7;">
            ⚠️ This is an automated tamper-evident record generated at the moment of accident report submission.
            Any discrepancy between this email and the database record may indicate unauthorised modification.
          </p>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Report Details
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 200px;">Report ID</td>
              <td style="padding: 7px 0; font-family: monospace; font-size: 12px; color: #475569;">${escapeHtml(r.id)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Logged At</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.createdAt)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Order Reference</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.orderReference)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Customer</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.customerName)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Store</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.storeId)}</td>
            </tr>
            ${r.reportedByName ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Reported By</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.reportedByName)}</td>
            </tr>` : ''}
          </table>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Vehicle Identity
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 200px;">Vehicle</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.vehicleName)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Plate Number</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.plateNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Engine Number</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.engineNumber)}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Chassis Number</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.chassisNumber)}</td>
            </tr>
          </table>
        </div>

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Incident Details
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 200px;">Date &amp; Time of Accident</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${escapeHtml(r.accidentAt)}</td>
            </tr>
            ${r.location ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Location</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.location)}</td>
            </tr>` : ''}
          </table>
          <div style="margin-top: 12px; background: #f8fafc; border-radius: 6px; padding: 12px;">
            <p style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; margin: 0 0 6px;">How it happened</p>
            <p style="font-size: 14px; color: #1e293b; margin: 0; line-height: 1.6;">${escapeHtml(r.description)}</p>
          </div>
        </div>

        ${r.damageDescription ? `
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
          <p style="font-size: 12px; font-weight: 700; color: #991B1B; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">
            🔴 Vehicle Damage
          </p>
          <p style="color: #7F1D1D; font-size: 14px; margin: 0; line-height: 1.6;">${escapeHtml(r.damageDescription)}</p>
        </div>` : ''}

        <div style="background: white; border-radius: 10px; padding: 24px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 14px;">
            Customer Welfare &amp; Safety
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 200px;">Customer Injured</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.customerInjured ? '#dc2626' : '#16a34a'};">
                ${r.customerInjured ? '⚠️ Yes' : '✅ No'}
              </td>
            </tr>
            ${r.customerInjured && r.injuryDescription ? `
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Injury Description</td>
              <td style="padding: 7px 0; color: #1e293b;">${escapeHtml(r.injuryDescription)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Medical Attention</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.medicalAttention ? '#d97706' : '#64748b'};">
                ${r.medicalAttention ? '⚠️ Yes' : 'No'}
              </td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Emergency Services</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.emergencyServicesCalled ? '#dc2626' : '#64748b'};">
                ${r.emergencyServicesCalled ? '🚨 Called' : 'Not called'}
              </td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Police Report</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.policeReportFiled ? '#1e293b' : '#64748b'};">
                ${r.policeReportFiled ? `✅ Filed${r.policeReportNumber ? ` — Ref: ${escapeHtml(r.policeReportNumber)}` : ''}` : 'Not filed'}
              </td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Helmets Worn</td>
              <td style="padding: 7px 0; color: #1e293b;">${r.helmetsWorn ? escapeHtml(r.helmetsWorn) : '—'}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Peace of Mind Cover</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.peaceOfMindActive ? '#16a34a' : '#64748b'};">
                ${r.peaceOfMindActive === true ? '✅ Active' : r.peaceOfMindActive === false ? 'Not purchased' : '—'}
              </td>
            </tr>
          </table>
        </div>

        ${r.thirdPartyNotes ? `
        <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 8px;">
            Third-Party Notes
          </p>
          <p style="font-size: 14px; color: #1e293b; margin: 0; line-height: 1.6;">${escapeHtml(r.thirdPartyNotes)}</p>
        </div>` : ''}

        <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
          <p style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 12px;">
            Evidence
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 7px 0; color: #64748b; width: 200px;">Photos Attached</td>
              <td style="padding: 7px 0; font-weight: 600; color: #1e293b;">${r.photoCount > 0 ? `${r.photoCount} photo${r.photoCount === 1 ? '' : 's'}` : 'None'}</td>
            </tr>
            <tr>
              <td style="padding: 7px 0; color: #64748b;">Customer Signature</td>
              <td style="padding: 7px 0; font-weight: 600; color: ${r.hasCustomerSignature ? '#16a34a' : '#64748b'};">
                ${r.hasCustomerSignature ? '✅ Captured' : 'Not captured'}
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0 0 6px; font-family: monospace;">
            TAMPER-EVIDENT HASH (SHA-256)
          </p>
          <p style="color: #FCBC5A; font-size: 12px; margin: 0; font-family: monospace; word-break: break-all;">
            ${escapeHtml(r.contentHash)}
          </p>
          <p style="color: #64748b; font-size: 10px; margin: 8px 0 0; line-height: 1.6;">
            Hash derived from: report ID + order reference + vehicle name + plate number + accident date/time + logged at timestamp.
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

export function buildAccidentHash(fields: {
  id: string;
  orderReference: string;
  vehicleName: string;
  plateNumber: string;
  accidentAt: string;
  createdAt: string;
}): string {
  const hashContent = [
    fields.id,
    fields.orderReference,
    fields.vehicleName,
    fields.plateNumber,
    fields.accidentAt,
    fields.createdAt,
  ].join('|');

  return createHash('sha256')
    .update(hashContent)
    .digest('hex')
    .toUpperCase()
    .slice(0, 32);
}
