import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PayslipRecord } from '../api/payroll.js';
import type { PayslipAcknowledgement } from '../api/me.js';

export function unpaidLeaveDays(p: Pick<PayslipRecord, 'dayLines'>): number {
  return (p.dayLines ?? []).filter((d) => d.dayType === 'Unpaid Leave').length;
}

// Helvetica has no peso glyph, so amounts are printed as "PHP 1,234.00".
function fmt(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}PHP ${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

const METHOD: Record<string, string> = { cash: 'Cash', gcash: 'GCash', bank_transfer: 'Bank transfer', other: 'Other' };

type LastTable = { lastAutoTable?: { finalY: number } };

function drawPayslip(doc: jsPDF, p: PayslipRecord, ack?: PayslipAcknowledgement | null): void {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const isThirteenth = p.runType === 'thirteenth_month';

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text("Lola's Rentals", margin, 18);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  doc.text(isThirteenth ? '13th Month Payslip' : 'Payslip', margin, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(p.employeeName, pageW - margin, 18, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  const periodLabel = isThirteenth
    ? `Year ${p.periodEnd.slice(0, 4)}`
    : `Period ${fmtDate(p.periodStart)} – ${fmtDate(p.periodEnd)}`;
  doc.text(periodLabel, pageW - margin, 24, { align: 'right' });
  doc.text(`Pay date ${fmtDate(p.payDate ?? p.periodEnd)}`, pageW - margin, 29, { align: 'right' });
  if (p.runStatus === 'voided') {
    doc.setTextColor(220, 38, 38);
    doc.setFont('helvetica', 'bold');
    doc.text('VOIDED', pageW - margin, 34, { align: 'right' });
  }

  doc.setDrawColor(229, 231, 235);
  doc.line(margin, 37, pageW - margin, 37);

  const earnings: Array<[string, string]> = [];
  if (isThirteenth) {
    earnings.push(['13th month pay', fmt(p.grossPay)]);
  } else {
    const isMonthly = (p.rateType ?? '').toLowerCase() === 'monthly';
    earnings.push([`Basic pay (${p.daysWorked} day${p.daysWorked === 1 ? '' : 's'}${isMonthly ? ', monthly rate' : ''})`, fmt(p.basicPay)]);
    if (p.leavePay > 0) earnings.push([`Paid leave (${p.leaveDays} day${p.leaveDays === 1 ? '' : 's'})`, fmt(p.leavePay)]);
    if (p.overtimePay > 0) earnings.push([`Overtime (${p.overtimeHours} h)`, fmt(p.overtimePay)]);
    if (p.holidayPremium > 0) earnings.push([`Holiday premium (${p.holidayDays} day${p.holidayDays === 1 ? '' : 's'})`, fmt(p.holidayPremium)]);
    if (p.ninePmEarnings > 0) earnings.push([`9pm returns (${p.ninePmCount})`, fmt(p.ninePmEarnings)]);
    if (p.commission > 0) earnings.push([`Commission (${p.commissionRate}% of ${fmt(p.pomRevenue)} Peace of Mind sales)`, fmt(p.commission)]);
    if (p.tips > 0) earnings.push([`Tips (${fmt(p.tipsPool)} pool shared by ${p.tipsHeadcount})`, fmt(p.tips)]);
    if (p.bonuses > 0) earnings.push(['Bonus', fmt(p.bonuses)]);
    const unpaid = unpaidLeaveDays(p);
    if (unpaid > 0) earnings.push([`Unpaid leave (${unpaid} day${unpaid === 1 ? '' : 's'})`, fmt(0)]);
  }

  const deductions: Array<[string, string]> = [];
  if (p.sss > 0) deductions.push(['SSS (employee share)', fmt(p.sss)]);
  if (p.philhealth > 0) deductions.push(['PhilHealth (employee share)', fmt(p.philhealth)]);
  if (p.pagibig > 0) deductions.push(['Pag-IBIG (employee share)', fmt(p.pagibig)]);
  if (p.ninePmPrepaid > 0) deductions.push(['9pm returns already paid from the till', fmt(p.ninePmPrepaid)]);
  if (p.cashAdvanceDeduction > 0) deductions.push(['Cash advance repayment', fmt(p.cashAdvanceDeduction)]);

  const tableStyle = {
    theme: 'plain' as const,
    styles: { fontSize: 9, cellPadding: 1.6, textColor: [55, 65, 81] as [number, number, number] },
    headStyles: { fontStyle: 'bold' as const, textColor: [17, 24, 39] as [number, number, number], fillColor: [243, 244, 246] as [number, number, number] },
    footStyles: { fontStyle: 'bold' as const, textColor: [17, 24, 39] as [number, number, number] },
    columnStyles: { 1: { halign: 'right' as const, cellWidth: 40 } },
    margin: { left: margin, right: margin },
  };

  autoTable(doc, {
    ...tableStyle,
    startY: 42,
    head: [['Earnings', 'Amount']],
    body: earnings,
    foot: [['Gross pay', fmt(p.grossPay)]],
  });

  let y = (doc as unknown as LastTable).lastAutoTable?.finalY ?? 60;
  autoTable(doc, {
    ...tableStyle,
    startY: y + 4,
    head: [['Deductions', 'Amount']],
    body: deductions.length > 0 ? deductions : [['None', fmt(0)]],
    foot: [['Total deductions', fmt(p.totalDeductions)]],
  });

  y = (doc as unknown as LastTable).lastAutoTable?.finalY ?? 100;
  doc.setFillColor(240, 253, 250);
  doc.rect(margin, y + 4, pageW - margin * 2, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(17, 94, 89);
  doc.text('Net pay', margin + 3, y + 11.5);
  doc.text(fmt(p.netPay), pageW - margin - 3, y + 11.5, { align: 'right' });
  y += 19;

  if (p.payments.length > 0) {
    autoTable(doc, {
      ...tableStyle,
      startY: y,
      head: [['Paid via', 'Amount']],
      body: p.payments.map((x) => [
        `${x.accountName ?? METHOD[x.method] ?? x.method}${x.reference ? ` (ref ${x.reference})` : ''}`,
        fmt(x.amount),
      ]),
    });
    y = ((doc as unknown as LastTable).lastAutoTable?.finalY ?? y) + 4;
  }

  if (!isThirteenth) {
    const info: Array<[string, string]> = [];
    const va = p.vehicleAllowance;
    if (va.opening !== 0 || va.accrued !== 0 || va.withdrawn !== 0 || va.closing !== 0) {
      info.push(['Vehicle allowance: brought forward', fmt(va.opening)]);
      if (va.accrued > 0) info.push(['Vehicle allowance: added this month', fmt(va.accrued)]);
      if (va.withdrawn > 0) info.push(['Vehicle allowance: taken from the till', fmt(-va.withdrawn)]);
      info.push(['Vehicle allowance: balance available', fmt(va.closing)]);
    }
    if (p.holidayLeaveBalance != null) info.push(['Holiday leave balance', `${p.holidayLeaveBalance} day(s)`]);
    if (p.sickLeaveBalance != null) info.push(['Sick leave balance', `${p.sickLeaveBalance} day(s)`]);
    if (p.thirteenthMonthAccrual > 0) info.push(['13th month earned this period', fmt(p.thirteenthMonthAccrual)]);
    const employer = p.employerSss + p.employerPhilhealth + p.employerPagibig;
    if (employer > 0) {
      info.push(['Employer contributions paid for you (SSS / PhilHealth / Pag-IBIG)',
        `${fmt(p.employerSss)} / ${fmt(p.employerPhilhealth)} / ${fmt(p.employerPagibig)}`]);
    }
    if (info.length > 0) {
      autoTable(doc, {
        ...tableStyle,
        startY: y,
        head: [['For your information', '']],
        body: info,
        columnStyles: { 1: { halign: 'right', cellWidth: 70 } },
      });
      y = ((doc as unknown as LastTable).lastAutoTable?.finalY ?? y) + 4;
    }
  }

  if (ack) {
    const pageH = doc.internal.pageSize.getHeight();
    if (y + 40 > pageH - 14) {
      doc.addPage();
      y = 20;
    }
    doc.setDrawColor(229, 231, 235);
    doc.line(margin, y + 2, pageW - margin, y + 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(ack.status === 'confirmed' ? 'Employee acknowledgement' : 'Employee query', margin, y + 9);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    const signedOn = new Date(ack.signedAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' });
    const statement = ack.status === 'confirmed'
      ? `I confirm I received ${fmt(ack.netPay)} and that the details on this payslip are correct.`
      : `Queried: ${ack.comment ?? ''}`;
    doc.text(doc.splitTextToSize(statement, pageW - margin * 2), margin, y + 15);
    doc.text(`${ack.signedName} · ${signedOn}`, margin, y + 22);
    if (ack.signaturePng) {
      try {
        doc.addImage(ack.signaturePng, 'PNG', pageW - margin - 50, y + 6, 50, 20);
      } catch {
        // A corrupt signature image shouldn't stop the payslip from printing.
      }
    }
    if (ack.resolvedAt) {
      doc.text(`Resolved by ${ack.resolvedByName ?? 'manager'}: ${ack.resolutionNote ?? ''}`, margin, y + 28);
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text(
    `Generated ${new Date().toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    margin,
    doc.internal.pageSize.getHeight() - 10,
  );
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function downloadPayslipPdf(slip: PayslipRecord, ack?: PayslipAcknowledgement | null): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  drawPayslip(doc, slip, ack);
  doc.save(`payslip-${slug(slip.employeeName)}-${slip.periodEnd}.pdf`);
}

export function downloadPayslipsPdf(
  slips: PayslipRecord[],
  fileLabel: string,
  acks?: Map<string, PayslipAcknowledgement>,
): void {
  if (slips.length === 0) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  slips.forEach((slip, i) => {
    if (i > 0) doc.addPage();
    drawPayslip(doc, slip, acks?.get(slip.id));
  });
  doc.save(`payslips-${slug(fileLabel)}.pdf`);
}
