import { describe, expect, it } from 'vitest';
import {
  extractPlaceholderKeys,
  fillBuiltInPlaceholders,
  parseContractMarkdown,
  renderContractTemplate,
} from '../src/utils/contract-template.js';
import type { ContractPlaceholderField } from '../src/schemas/contract-schemas.js';

const fields: ContractPlaceholderField[] = [
  { key: 'partner_name', label: 'Partner', type: 'text', required: true },
  { key: 'fee', label: 'Fee', type: 'money', required: true },
  { key: 'start_date', label: 'Start', type: 'date', required: true },
  { key: 'notes', label: 'Notes', type: 'multiline', required: false },
  { key: 'term', label: 'Term', type: 'text', required: true, defaultValue: '12 months' },
];

describe('extractPlaceholderKeys', () => {
  it('returns each tag once and tolerates inner spaces', () => {
    expect(extractPlaceholderKeys('{{a}} and {{ b }} and {{a}} but not {{1x}} or {single}')).toEqual(['a', 'b']);
  });
});

describe('renderContractTemplate', () => {
  it('fills and formats values', () => {
    const r = renderContractTemplate(
      'Between {{partner_name}} for {{fee}} from {{start_date}} for {{term}}.',
      fields,
      { partner_name: 'Island Cafe', fee: '1500', start_date: '2026-12-01' },
    );
    expect(r.body).toBe('Between Island Cafe for PHP 1,500.00 from 1 December 2026 for 12 months.');
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it('keeps missing required tags and reports them', () => {
    const r = renderContractTemplate('Hi {{partner_name}}, fee {{fee}}', fields, { partner_name: '  ' });
    expect(r.body).toBe('Hi {{partner_name}}, fee {{fee}}');
    expect(r.missing).toEqual(['partner_name', 'fee']);
  });

  it('drops empty optional fields', () => {
    expect(renderContractTemplate('Notes: {{notes}}.', fields, {}).body).toBe('Notes: .');
  });

  it('flags unknown tags and leaves built-ins for send time without counting them missing', () => {
    const r = renderContractTemplate('{{mystery}} on {{today}} for {{recipient_name}}', fields, { recipient_name: 'Ana' });
    expect(r.body).toBe('{{mystery}} on {{today}} for Ana');
    expect(r.unknown).toEqual(['mystery']);
    expect(r.missing).toEqual([]);
  });
});

describe('fillBuiltInPlaceholders', () => {
  it('only replaces built-in tags that have values', () => {
    expect(fillBuiltInPlaceholders('{{today}} {{lola_signer_name}} {{lola_signer_title}} {{partner_name}}', {
      today: '12 November 2026',
      lola_signer_name: 'Jack',
      lola_signer_title: '',
    })).toBe('12 November 2026 Jack {{lola_signer_title}} {{partner_name}}');
  });
});

describe('parseContractMarkdown', () => {
  it('parses headings, paragraphs with line breaks, lists, rules and inline styles', () => {
    const blocks = parseContractMarkdown('# Title\n\nLine **one**\nline *two*\n\n- a\n- b\n\n1. x\n2) y\n\n---\n## Next');
    expect(blocks).toEqual([
      { type: 'heading', level: 1, spans: [{ text: 'Title' }] },
      { type: 'paragraph', lines: [[{ text: 'Line ' }, { text: 'one', bold: true }], [{ text: 'line ' }, { text: 'two', italic: true }]] },
      { type: 'list', ordered: false, items: [[{ text: 'a' }], [{ text: 'b' }]] },
      { type: 'list', ordered: true, items: [[{ text: 'x' }], [{ text: 'y' }]] },
      { type: 'rule' },
      { type: 'heading', level: 2, spans: [{ text: 'Next' }] },
    ]);
  });

  it('does not treat a lone asterisk as italic', () => {
    expect(parseContractMarkdown('5 * 3 = 15')).toEqual([{ type: 'paragraph', lines: [[{ text: '5 * 3 = 15' }]] }]);
  });
});
