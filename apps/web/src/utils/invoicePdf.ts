import jsPDF from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import type { Invoice, InvoiceSettings } from '../api/invoices.js';
import { LOGO_HEIGHT_MM, LOGO_WIDTH_MM, loadCompanyLogoPng, moneyExact } from './pdfShared.js';

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [209, 213, 219];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00+08:00`) : new Date(iso);
  return d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2);
}

export async function generateInvoicePdf(invoice: Invoice, settings: InvoiceSettings): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const isVoid = invoice.status === 'void';

  // ── Seller block ─────────────────────────────────────────────────────────
  const logoPng = settings.showLogo ? await loadCompanyLogoPng() : null;
  let y = 10;
  if (logoPng) {
    doc.addImage(logoPng, 'PNG', margin, y, LOGO_WIDTH_MM, LOGO_HEIGHT_MM);
    y += LOGO_HEIGHT_MM + 5;
  } else {
    y += 6;
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(settings.legalName, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const sellerLines = [
    ...(settings.address ? doc.splitTextToSize(settings.address, 90) as string[] : []),
    settings.phone ? `Tel: ${settings.phone}` : null,
    settings.email,
    settings.tin ? `TIN: ${settings.tin}` : null,
  ].filter((l): l is string => !!l);
  sellerLines.forEach((line, i) => doc.text(line, margin, y + 4.5 + i * 4));
  const sellerBottom = y + 4.5 + sellerLines.length * 4;

  // ── Invoice title & meta ─────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('INVOICE', pageW - margin, 20, { align: 'right' });
  doc.setFontSize(9);
  const meta: [string, string][] = [
    ['Invoice no.', invoice.invoiceNumber],
    ['Issue date', fmtDate(invoice.issueDate)],
    ...(invoice.dueDate ? [['Due date', fmtDate(invoice.dueDate)] as [string, string]] : []),
    ['Balance due', moneyExact(Math.max(0, invoice.balanceDue))],
  ];
  meta.forEach(([label, value], i) => {
    const my = 28 + i * 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, pageW - margin - 40, my, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(value, pageW - margin, my, { align: 'right' });
  });
  const metaBottom = 28 + meta.length * 5;

  // ── Bill to ──────────────────────────────────────────────────────────────
  y = Math.max(sellerBottom, metaBottom) + 6;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('BILL TO', margin, y);
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  y += 5;
  if (invoice.billToCompany) {
    doc.text(invoice.billToCompany, margin, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`Attn: ${invoice.billToName}`, margin, y);
  } else {
    doc.text(invoice.billToName, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }
  doc.setTextColor(...MUTED);
  const billLines = [
    ...(invoice.billToAddress ? doc.splitTextToSize(invoice.billToAddress, 100) as string[] : []),
    invoice.billToEmail,
    invoice.billToTin ? `TIN: ${invoice.billToTin}` : null,
  ].filter((l): l is string => !!l);
  billLines.forEach((line) => {
    y += 4.2;
    doc.text(line, margin, y);
  });
  y += 7;

  // ── Charges, grouped by booking ──────────────────────────────────────────
  const charges = invoice.lines.filter((l) => l.lineType !== 'payment');
  const payments = invoice.lines.filter((l) => l.lineType === 'payment');
  const body: RowInput[] = [];
  for (const ref of invoice.orderReferences) {
    const lines = charges.filter((l) => l.orderReference === ref);
    if (lines.length === 0) continue;
    body.push([{ content: `Booking ${ref}`, colSpan: 4, styles: { fontStyle: 'bold', fillColor: [243, 244, 246], textColor: INK } }]);
    for (const l of lines) {
      body.push([l.description, fmtQty(l.quantity), moneyExact(l.unitPrice), moneyExact(l.amount)]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    tableWidth: contentW,
    head: [['Description', 'Qty', 'Unit price', 'Amount']],
    body,
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2, overflow: 'linebreak', valign: 'top', textColor: [55, 65, 81] },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 14, halign: 'right' },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 32, halign: 'right' },
    },
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 0) {
        doc.setDrawColor(229, 231, 235);
        doc.line(margin, data.cell.y + data.cell.height, pageW - margin, data.cell.y + data.cell.height);
      }
    },
  });

  // ── Totals ───────────────────────────────────────────────────────────────
  type DocWithTable = jsPDF & { lastAutoTable?: { finalY: number } };
  y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 6;
  const pageH = doc.internal.pageSize.getHeight();
  if (y > pageH - 60) {
    doc.addPage();
    y = 20;
  }

  const totalsX = pageW - margin - 75;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10.5 : 9);
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(label, totalsX, y);
    doc.setTextColor(...INK);
    doc.text(value, pageW - margin, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  totalRow('Subtotal', moneyExact(invoice.subtotal));
  totalRow('Amount paid', moneyExact(-invoice.amountPaid));
  doc.setDrawColor(...RULE);
  doc.line(totalsX, y - 3, pageW - margin, y - 3);
  y += 1.5;
  totalRow(invoice.balanceDue < 0 ? 'Credit' : 'Balance due', moneyExact(Math.abs(invoice.balanceDue)), true);
  if (invoice.depositHeld > 0) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Refundable security deposit held: ${moneyExact(invoice.depositHeld)} (not included above)`, pageW - margin, y, { align: 'right' });
    y += 6;
  }

  // ── Payments received ────────────────────────────────────────────────────
  if (payments.length > 0) {
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margin, right: margin },
      tableWidth: contentW,
      head: [['Payments received', 'Booking', 'Amount']],
      body: payments.map((p) => [p.description, p.orderReference, moneyExact(-p.amount)]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.8, textColor: [55, 65, 81] },
      headStyles: { fillColor: [243, 244, 246], textColor: MUTED, fontStyle: 'bold', fontSize: 7.5 },
      columnStyles: { 1: { cellWidth: 40 }, 2: { cellWidth: 32, halign: 'right' } },
    });
    y = ((doc as DocWithTable).lastAutoTable?.finalY ?? y) + 6;
  }

  // ── Notes & payment instructions ─────────────────────────────────────────
  const blocks: [string, string][] = [];
  if (invoice.notes) blocks.push(['Notes', invoice.notes]);
  if (settings.paymentInstructions) blocks.push(['How to pay', settings.paymentInstructions]);
  for (const [title, text] of blocks) {
    const wrapped = doc.splitTextToSize(text, contentW) as string[];
    if (y + 6 + wrapped.length * 4 > pageH - 16) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(title, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(75, 85, 99);
    doc.text(wrapped, margin, y + 4.5);
    y += 8 + wrapped.length * 4;
  }

  // ── Footer & void stamp on every page ────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    if (isVoid) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(80);
      doc.setTextColor(239, 68, 68);
      doc.text('VOID', pageW / 2, pageH / 2, { align: 'center', angle: 30 });
    }
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(settings.footerNote || `Thank you for choosing ${settings.legalName}.`, margin, pageH - 6);
    doc.text(`${invoice.invoiceNumber} · Page ${p} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
  }

  doc.save(`Invoice_${invoice.invoiceNumber.replace(/[^a-z0-9-]/gi, '_')}.pdf`);
}
