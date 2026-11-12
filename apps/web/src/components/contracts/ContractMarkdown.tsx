import type { ReactNode } from 'react';
import { parseContractMarkdown, type ContractSpan } from '@lolas/shared';

const TAG_SPLIT_RE = /(\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\})/;
const IS_TAG_RE = /^\{\{\s*[a-zA-Z][a-zA-Z0-9_]*\s*\}\}$/;

function renderText(text: string, key: string): ReactNode[] {
  return text.split(TAG_SPLIT_RE).map((part, i) =>
    IS_TAG_RE.test(part)
      ? <mark key={`${key}-${i}`} className="rounded bg-amber-100 px-1 font-mono text-[0.85em] text-amber-800">{part}</mark>
      : part,
  );
}

function Spans({ spans, k }: { spans: ContractSpan[]; k: string }) {
  return (
    <>
      {spans.map((s, i) => {
        const content = renderText(s.text, `${k}-${i}`);
        if (s.bold && s.italic) return <strong key={i}><em>{content}</em></strong>;
        if (s.bold) return <strong key={i}>{content}</strong>;
        if (s.italic) return <em key={i}>{content}</em>;
        return <span key={i}>{content}</span>;
      })}
    </>
  );
}

export function ContractMarkdown({ body, className = '' }: { body: string; className?: string }) {
  const blocks = parseContractMarkdown(body);
  if (blocks.length === 0) return <p className="text-sm italic text-gray-400">Nothing to preview yet.</p>;

  return (
    <div className={`space-y-3 text-sm leading-relaxed text-gray-800 ${className}`}>
      {blocks.map((b, i) => {
        const k = String(i);
        if (b.type === 'heading') {
          const cls = b.level === 1 ? 'pt-2 text-xl font-bold' : b.level === 2 ? 'pt-2 text-base font-bold' : 'pt-1 text-sm font-bold';
          return <p key={k} className={`${cls} text-gray-900`}><Spans spans={b.spans} k={k} /></p>;
        }
        if (b.type === 'rule') return <hr key={k} className="border-gray-200" />;
        if (b.type === 'list') {
          const ListTag = b.ordered ? 'ol' : 'ul';
          return (
            <ListTag key={k} className={`space-y-1 pl-6 ${b.ordered ? 'list-decimal' : 'list-disc'}`}>
              {b.items.map((item, j) => <li key={j}><Spans spans={item} k={`${k}-${j}`} /></li>)}
            </ListTag>
          );
        }
        return (
          <p key={k}>
            {b.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Spans spans={line} k={`${k}-${j}`} />
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
