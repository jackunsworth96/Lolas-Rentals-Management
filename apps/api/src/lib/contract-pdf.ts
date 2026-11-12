import { jsPDF } from 'jspdf';
import { parseContractMarkdown, type ContractSpan } from '@lolas/shared';

const PAGE_W = 210;
const MARGIN_X = 20;
const MARGIN_TOP = 20;
const BOTTOM = 277;
const CONTENT_W = PAGE_W - MARGIN_X * 2;
const MM_PER_PT = 0.3528;
const TEAL: [number, number, number] = [0, 87, 124];
const CHARCOAL: [number, number, number] = [54, 55, 55];

/** Helvetica in jsPDF is WinAnsi only; map common extras and strip the rest. */
export function pdfSafeText(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/₱/g, 'PHP ')
    .replace(/[–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\t\n\r\x20-\x7E]/g, '');
}

export interface ContractPdfSignature {
  heading: string;
  name: string;
  title?: string | null;
  signedAt: string;
  /** PNG data URL. */
  signatureDataUrl: string | null;
}

export interface ContractPdfInput {
  contractId: string;
  title: string;
  renderedBody: string;
  bodySha256: string;
  lola: ContractPdfSignature;
  recipient: ContractPdfSignature;
  signerIp?: string | null;
}

type Style = 'normal' | 'bold' | 'italic' | 'bolditalic';

function spanStyle(s: ContractSpan, forceBold: boolean): Style {
  const bold = forceBold || !!s.bold;
  if (bold && s.italic) return 'bolditalic';
  if (bold) return 'bold';
  if (s.italic) return 'italic';
  return 'normal';
}

class Writer {
  y = MARGIN_TOP;

  constructor(readonly doc: jsPDF) {}

  ensure(height: number): void {
    if (this.y + height > BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN_TOP;
    }
  }

  /** Writes hard-broken lines of styled spans, wrapping word by word. */
  spans(lines: ContractSpan[][], opts: { size: number; x?: number; width?: number; bold?: boolean; prefix?: string }): void {
    const { doc } = this;
    const x0 = opts.x ?? MARGIN_X;
    const width = opts.width ?? CONTENT_W;
    const lineH = opts.size * MM_PER_PT * 1.45;
    doc.setFontSize(opts.size);

    lines.forEach((line, lineIdx) => {
      const words: { text: string; style: Style; spaceBefore: boolean }[] = [];
      let pendingSpace = false;
      for (const span of line) {
        for (const part of pdfSafeText(span.text).split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { pendingSpace = true; continue; }
          words.push({ text: part, style: spanStyle(span, !!opts.bold), spaceBefore: pendingSpace && words.length > 0 });
          pendingSpace = false;
        }
      }

      this.ensure(lineH);
      this.y += lineH * 0.8;
      if (opts.prefix && lineIdx === 0) {
        doc.setFont('helvetica', 'normal');
        doc.text(opts.prefix, x0 - 6, this.y);
      }
      let cx = x0;
      for (const w of words) {
        doc.setFont('helvetica', w.style);
        const ww = doc.getTextWidth(w.text);
        const space = w.spaceBefore ? doc.getTextWidth(' ') : 0;
        if (cx > x0 && cx + space + ww > x0 + width) {
          this.y += lineH;
          this.ensure(lineH);
          cx = x0;
        } else {
          cx += space;
        }
        doc.text(w.text, cx, this.y);
        cx += ww;
      }
      this.y += lineH * 0.2;
    });
  }
}

function signatureBlock(doc: jsPDF, sig: ContractPdfSignature, x: number, y: number, width: number): void {
  doc.setTextColor(...TEAL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfSafeText(sig.heading).toUpperCase(), x, y);

  const boxTop = y + 3;
  const boxH = 24;
  if (sig.signatureDataUrl) {
    try {
      const props = doc.getImageProperties(sig.signatureDataUrl);
      const scale = Math.min(width / props.width, boxH / props.height);
      doc.addImage(sig.signatureDataUrl, 'PNG', x, boxTop, props.width * scale, props.height * scale);
    } catch {
      /* unreadable image: leave the line blank */
    }
  }

  doc.setDrawColor(...CHARCOAL);
  doc.setLineWidth(0.3);
  doc.line(x, boxTop + boxH + 1, x + width, boxTop + boxH + 1);

  doc.setTextColor(...CHARCOAL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  let ty = boxTop + boxH + 6;
  doc.text(pdfSafeText(sig.name), x, ty);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (sig.title) { ty += 4.5; doc.text(pdfSafeText(sig.title), x, ty); }
  ty += 4.5;
  doc.text(`Signed: ${pdfSafeText(sig.signedAt)}`, x, ty);
}

export function buildContractPdf(input: ContractPdfInput): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const w = new Writer(doc);

  doc.setTextColor(...TEAL);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text("LOLA'S RENTALS", MARGIN_X, w.y);
  w.y += 4;
  doc.setTextColor(...CHARCOAL);
  w.spans([[{ text: input.title }]], { size: 18, bold: true });
  w.y += 2;
  doc.setDrawColor(...TEAL);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, w.y, PAGE_W - MARGIN_X, w.y);
  w.y += 4;

  for (const block of parseContractMarkdown(input.renderedBody)) {
    if (block.type === 'heading') {
      w.y += block.level === 1 ? 4 : 3;
      w.spans([block.spans], { size: block.level === 1 ? 14 : block.level === 2 ? 12 : 11, bold: true });
      w.y += 1;
    } else if (block.type === 'paragraph') {
      w.spans(block.lines, { size: 10 });
      w.y += 2.5;
    } else if (block.type === 'list') {
      block.items.forEach((item, idx) => {
        w.spans([item], { size: 10, x: MARGIN_X + 7, width: CONTENT_W - 7, prefix: block.ordered ? `${idx + 1}.` : '-' });
        w.y += 0.8;
      });
      w.y += 2;
    } else {
      w.ensure(6);
      w.y += 2;
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      doc.line(MARGIN_X, w.y, PAGE_W - MARGIN_X, w.y);
      w.y += 4;
    }
  }

  const sigH = 50;
  w.ensure(sigH + 22);
  w.y += 8;
  doc.setTextColor(...CHARCOAL);
  w.spans([[{ text: 'Signatures' }]], { size: 12, bold: true });
  w.y += 5;
  const colW = (CONTENT_W - 12) / 2;
  signatureBlock(doc, input.lola, MARGIN_X, w.y, colW);
  signatureBlock(doc, input.recipient, MARGIN_X + colW + 12, w.y, colW);
  w.y += sigH;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  const audit = [
    `Document fingerprint (SHA-256): ${input.bodySha256}`,
    `Signed electronically via Lola's Rentals${input.signerIp ? ` from IP ${pdfSafeText(input.signerIp)}` : ''}.`,
  ];
  for (const line of audit) {
    for (const wrapped of doc.splitTextToSize(line, CONTENT_W) as string[]) {
      w.ensure(4);
      doc.text(wrapped, MARGIN_X, w.y);
      w.y += 3.5;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(140, 140, 140);
    doc.text(`Contract ${input.contractId}`, MARGIN_X, 290);
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN_X, 290, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer'));
}
