import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PartnerReport, PartnerReportBooking } from '../api/partner-portal.js';

function money(value: number): string {
  return `PHP ${value.toLocaleString('en-PH', { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
  });
}

function statusLabel(status: string): string {
  if (status.toLowerCase() === 'cancelled') return 'Cancelled';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function commissionCell(b: PartnerReportBooking): string {
  if (b.status.toLowerCase() === 'cancelled') return 'Cancelled';
  if (!b.commissionable) return 'Not eligible';

  let line = money(b.commissionAmount);
  if (b.commissionType === 'percentage' && b.commissionBase !== null) {
    line += `\n${b.commissionValue ?? 0}% on ${money(b.commissionBase)}`;
  } else if (b.commissionType === 'fixed' && b.commissionValue !== null) {
    line += `\n${money(b.commissionValue)} fixed`;
  }
  if (b.pendingCommissionAmount > 0) {
    line += `\n+ ${money(b.pendingCommissionAmount)} pending`;
  }
  return line;
}

export function generatePartnerReportPdf(
  partnerName: string,
  month: string,
  report: PartnerReport,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;

  // Friendly month label e.g. "July 2026"
  const [year, mon] = month.split('-');
  const monthLabel = new Date(Number(year), Number(mon) - 1, 1).toLocaleDateString('en-PH', {
    month: 'long',
    year: 'numeric',
  });

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39);
  doc.text("Lola's Rentals", margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99);
  doc.text('Partner Commission Report', margin, 25);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(partnerName, pageW - margin, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(monthLabel, pageW - margin, 24, { align: 'right' });
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageW - margin,
    29,
    { align: 'right' },
  );

  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.3);
  doc.line(margin, 33, pageW - margin, 33);

  // ── Summary cards ──────────────────────────────────────────────────────────
  const summaryY = 39;
  const colW = contentW / 4;

  const summaryItems = [
    { label: 'Total Bookings', value: String(report.totalBookings) },
    { label: 'Commissionable', value: String(report.commissionableBookings) },
    { label: 'Commission Due', value: money(report.totalCommission) },
    { label: 'Avg Vehicles/Day', value: report.averageVehiclesPerDay.toFixed(2) },
  ];

  summaryItems.forEach(({ label, value }, i) => {
    const x = margin + i * colW + colW / 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(17, 24, 39);
    doc.text(value, x, summaryY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text(label, x, summaryY + 5, { align: 'center' });
  });

  if (report.totalPendingCommission > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(217, 119, 6); // amber-600
    doc.text(
      `+ ${money(report.totalPendingCommission)} pending commission`,
      margin + contentW / 2,
      summaryY + 12,
      { align: 'center' },
    );
  }

  doc.setDrawColor(209, 213, 219);
  doc.line(margin, summaryY + 16, pageW - margin, summaryY + 16);

  // ── Bookings table ─────────────────────────────────────────────────────────
  const tableBody = report.bookings.map((b) => {
    const returnDate =
      b.isExtended && b.extendedDropoffDatetime ? b.extendedDropoffDatetime : b.dropoffDatetime;
    const dates =
      fmtDate(b.pickupDatetime) + (returnDate ? `\nReturn: ${fmtDate(returnDate)}` : '');
    return [
      b.orderReference ?? '—',
      b.customerName ?? '—',
      dates + (b.isExtended ? '\n[Extended]' : ''),
      statusLabel(b.status),
      commissionCell(b),
    ];
  });

  autoTable(doc, {
    startY: summaryY + 20,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    head: [['Ref', 'Customer', 'Dates', 'Status', 'Commission']],
    body: tableBody,
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak', valign: 'top' },
    headStyles: {
      fillColor: [249, 250, 251],
      textColor: [107, 114, 128],
      fontStyle: 'bold',
      fontSize: 7.5,
      lineWidth: 0.2,
      lineColor: [229, 231, 235],
    },
    columnStyles: {
      0: { cellWidth: 28, fontStyle: 'bold', textColor: [55, 65, 81] },
      1: { cellWidth: 38 },
      2: { cellWidth: 30, textColor: [107, 114, 128] },
      3: { cellWidth: 26 },
      4: { cellWidth: 'auto', halign: 'right' },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didParseCell(data) {
      const rowIdx = data.row.index;
      const b = report.bookings[rowIdx];
      if (!b) return;
      if (b.status.toLowerCase() === 'cancelled') {
        data.cell.styles.textColor = [185, 28, 28];
      } else if (data.column.index === 4 && b.commissionable) {
        data.cell.styles.textColor = [15, 118, 110]; // teal-700
      }
    },
    theme: 'grid',
  });

  // ── Footer on every page ───────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const pageH = doc.internal.pageSize.getHeight();
    doc.setDrawColor(209, 213, 219);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text("Lola's Rentals — Confidential", margin, pageH - 6);
    doc.text(`Page ${p} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  const safeMonth = month.replace(/[^0-9-]/g, '');
  const safeName = partnerName.replace(/[^a-z0-9]/gi, '_');
  doc.save(`Partner_Report_${safeName}_${safeMonth}.pdf`);
}
