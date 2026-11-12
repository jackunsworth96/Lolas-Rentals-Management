import type { ContractPlaceholderField } from '../schemas/contract-schemas.js';

/** Matches `{{ key }}`. Keys start with a letter and use letters, digits and underscores. */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Filled in by the system rather than typed per contract. */
export const BUILT_IN_CONTRACT_PLACEHOLDERS = [
  { key: 'today', label: "Today's date" },
  { key: 'recipient_name', label: 'Recipient name' },
  { key: 'lola_signer_name', label: "Lola's signer name" },
  { key: 'lola_signer_title', label: "Lola's signer title" },
] as const;

const BUILT_IN_KEYS: ReadonlySet<string> = new Set(BUILT_IN_CONTRACT_PLACEHOLDERS.map((p) => p.key));

export function extractPlaceholderKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const m of body.matchAll(PLACEHOLDER_RE)) keys.add(m[1]!);
  return [...keys];
}

export function formatContractDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatValue(raw: string, field: ContractPlaceholderField | undefined): string {
  const value = raw.trim();
  if (!field || !value) return value;
  if (field.type === 'date') return formatContractDate(value);
  if (field.type === 'money' || field.type === 'number') {
    const n = Number(value.replace(/,/g, ''));
    if (!Number.isFinite(n)) return value;
    const opts = field.type === 'money'
      ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
      : { maximumFractionDigits: 4 };
    const formatted = n.toLocaleString('en-PH', opts);
    return field.type === 'money' ? `PHP ${formatted}` : formatted;
  }
  return value;
}

export interface RenderContractResult {
  body: string;
  /** Required template fields with no value. Left as `{{key}}` in `body`; empty built-ins are also kept. */
  missing: string[];
  /** Tags in the body that are neither declared fields nor built-ins. Left as `{{key}}`. */
  unknown: string[];
}

/**
 * Replaces `{{key}}` with formatted values. Unfilled or unknown tags are kept
 * verbatim so previews can highlight them and sending can be blocked.
 */
export function renderContractTemplate(
  body: string,
  fields: ContractPlaceholderField[],
  values: Record<string, string | null | undefined>,
): RenderContractResult {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const missing = new Set<string>();
  const unknown = new Set<string>();

  const rendered = body.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const field = byKey.get(key);
    if (!field && !BUILT_IN_KEYS.has(key)) {
      unknown.add(key);
      return whole;
    }
    const raw = values[key] ?? field?.defaultValue ?? '';
    if (!raw.trim()) {
      if (!field) return whole;
      if (field.required) missing.add(key);
      return field.required ? whole : '';
    }
    return formatValue(raw, field);
  });

  return { body: rendered, missing: [...missing], unknown: [...unknown] };
}

export type BuiltInContractValues = Partial<Record<(typeof BUILT_IN_CONTRACT_PLACEHOLDERS)[number]['key'], string>>;

/** Fills only the built-in tags; everything else is left untouched. */
export function fillBuiltInPlaceholders(body: string, values: BuiltInContractValues): string {
  return body.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const v = (values as Record<string, string | undefined>)[key];
    return BUILT_IN_KEYS.has(key) && v?.trim() ? v.trim() : whole;
  });
}

// ── Minimal markdown model shared by the web preview and the PDF ─────────────

export interface ContractSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export type ContractBlock =
  | { type: 'heading'; level: 1 | 2 | 3; spans: ContractSpan[] }
  | { type: 'paragraph'; lines: ContractSpan[][] }
  | { type: 'list'; ordered: boolean; items: ContractSpan[][] }
  | { type: 'rule' };

const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

export function parseContractInline(text: string): ContractSpan[] {
  const spans: ContractSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) spans.push({ text: text.slice(last, idx) });
    const token = m[0];
    if (token.startsWith('**') || token.startsWith('__')) spans.push({ text: token.slice(2, -2), bold: true });
    else spans.push({ text: token.slice(1, -1), italic: true });
    last = idx + token.length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans.length > 0 ? spans : [{ text: '' }];
}

const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^\d+[.)]\s+(.*)$/;

/**
 * Supports `#`/`##`/`###` headings, paragraphs (single newlines kept as line
 * breaks), `-`/`*` bullets, `1.` numbered lists, `---` rules, **bold** and *italic*.
 */
export function parseContractMarkdown(markdown: string): ContractBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: ContractBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const t = lines[i]!.trim();
    if (!t) { i++; continue; }

    const heading = /^(#{1,3})\s+(.*)$/.exec(t);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1]!.length as 1 | 2 | 3, spans: parseContractInline(heading[2]!) });
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    const ordered = OL_RE.test(t);
    if (ordered || UL_RE.test(t)) {
      const re = ordered ? OL_RE : UL_RE;
      const items: ContractSpan[][] = [];
      while (i < lines.length) {
        const m = re.exec(lines[i]!.trim());
        if (!m) break;
        items.push(parseContractInline(m[1]!));
        i++;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para: ContractSpan[][] = [];
    while (i < lines.length) {
      const l = lines[i]!.trim();
      if (!l || /^#{1,3}\s/.test(l) || UL_RE.test(l) || OL_RE.test(l) || /^(-{3,}|\*{3,}|_{3,})$/.test(l)) break;
      para.push(parseContractInline(l));
      i++;
    }
    blocks.push({ type: 'paragraph', lines: para });
  }

  return blocks;
}
