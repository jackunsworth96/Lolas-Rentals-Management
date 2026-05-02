import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PartEntry {
  name: string;
  cost: number;
}

interface MaintenanceRow {
  id: string;
  status: string;
  issueDescription: string | null;
  workPerformed: string | null;
  mechanic: string | null;
  partsReplaced: PartEntry[] | null;
  partsCost: number | { amount: number };
  laborCost: number | { amount: number };
  totalCost: number | { amount: number };
  downtimeStart: string | null;
  downtimeEnd: string | null;
  totalDowntimeDays: number | null;
  odometer: number | null;
  nextServiceDue: number | null;
  nextServiceDueDate: string | null;
  opsNotes: string | null;
  createdAt: string;
}

function moneyVal(v: number | { amount: number } | null | undefined): number {
  if (v == null) return 0;
  return typeof v === 'number' ? v : (v.amount ?? 0);
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount);
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function generateServiceHistoryPdf(vehicleName: string, records: MaintenanceRow[]): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(17, 24, 39); // gray-900
  doc.text("Lola's Rentals", margin, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(75, 85, 99); // gray-600
  doc.text('Vehicle Service History Report', margin, 25);

  // Vehicle name + date right-aligned
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(vehicleName, pageW - margin, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(
    `Generated: ${new Date().toLocaleDateString('en-PH', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    pageW - margin,
    24,
    { align: 'right' },
  );

  // Divider
  doc.setDrawColor(209, 213, 219); // gray-300
  doc.setLineWidth(0.3);
  doc.line(margin, 28, pageW - margin, 28);

  // ── Summary totals bar ───────────────────────────────────────────────────────
  const grandTotal = records.reduce((s, r) => s + moneyVal(r.totalCost), 0);
  const completed = records.filter((r) => r.status === 'Completed').length;

  const summaryY = 34;
  const colW = contentW / 3;

  const summaryItems = [
    { label: 'Total Records', value: String(records.length) },
    { label: 'Completed Services', value: String(completed) },
    { label: 'Total Cost', value: fmt(grandTotal) },
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

  doc.setDrawColor(209, 213, 219);
  doc.line(margin, summaryY + 9, pageW - margin, summaryY + 9);

  // ── Records ──────────────────────────────────────────────────────────────────
  let cursorY = summaryY + 14;

  records.forEach((r, idx) => {
    // Page-break guard (need at least 40 mm for a record)
    if (cursorY > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      cursorY = 14;
    }

    // Record header row
    const statusColors: Record<string, [number, number, number]> = {
      Completed: [22, 163, 74],
      'In Progress': [234, 179, 8],
      Reported: [156, 163, 175],
    };
    const [sr, sg, sb] = statusColors[r.status] ?? [156, 163, 175];

    // Index badge
    doc.setFillColor(243, 244, 246);
    doc.roundedRect(margin, cursorY - 3.5, contentW, 8, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(sr, sg, sb);
    doc.text(r.status.toUpperCase(), margin + 2, cursorY + 1);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(107, 114, 128);
    doc.text(`#${idx + 1}  ·  ${fmtDate(r.createdAt)}`, margin + 2 + doc.getTextWidth(r.status.toUpperCase()) + 6, cursorY + 1);

    if (moneyVal(r.totalCost) > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(17, 24, 39);
      doc.text(fmt(moneyVal(r.totalCost)), pageW - margin - 2, cursorY + 1, { align: 'right' });
    }

    cursorY += 7;

    // Build detail rows for autoTable
    const rows: [string, string][] = [];

    rows.push(['Issue', r.issueDescription ?? '—']);
    if (r.workPerformed) rows.push(['Work Performed', r.workPerformed]);
    if (r.mechanic) rows.push(['Mechanic', r.mechanic]);
    if (r.odometer != null) rows.push(['Odometer', `${r.odometer.toLocaleString('en-PH')} km`]);
    if (r.downtimeStart) {
      const range = `${fmtDate(r.downtimeStart)} → ${r.downtimeEnd ? fmtDate(r.downtimeEnd) : 'ongoing'}`;
      const days = r.totalDowntimeDays != null ? `  (${r.totalDowntimeDays} day${r.totalDowntimeDays !== 1 ? 's' : ''})` : '';
      rows.push(['Downtime', range + days]);
    }
    if (Array.isArray(r.partsReplaced) && r.partsReplaced.length > 0) {
      const parts = r.partsReplaced
        .map((p) => `${p.name}${p.cost > 0 ? ` (${fmt(p.cost)})` : ''}`)
        .join(', ');
      rows.push(['Parts Replaced', parts]);
    }
    if (moneyVal(r.partsCost) > 0) rows.push(['Parts Cost', fmt(moneyVal(r.partsCost))]);
    if (moneyVal(r.laborCost) > 0) rows.push(['Labour Cost', fmt(moneyVal(r.laborCost))]);
    if (moneyVal(r.totalCost) > 0) rows.push(['Total Cost', fmt(moneyVal(r.totalCost))]);
    if (r.nextServiceDue != null) rows.push(['Next Service (km)', `${r.nextServiceDue.toLocaleString('en-PH')} km`]);
    if (r.nextServiceDueDate) rows.push(['Next Service Date', fmtDate(r.nextServiceDueDate)]);
    if (r.opsNotes) rows.push(['Notes', r.opsNotes]);

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      body: rows,
      columns: [
        { dataKey: 0, header: '' },
        { dataKey: 1, header: '' },
      ],
      showHead: 'never',
      styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak' },
      columnStyles: {
        0: { fontStyle: 'bold', textColor: [75, 85, 99], cellWidth: 36 },
        1: { textColor: [17, 24, 39] },
      },
      theme: 'plain',
    });

    cursorY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  });

  // ── Footer on every page ─────────────────────────────────────────────────────
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

  const safeName = vehicleName.replace(/[^a-z0-9]/gi, '_');
  doc.save(`Service_History_${safeName}.pdf`);
}
