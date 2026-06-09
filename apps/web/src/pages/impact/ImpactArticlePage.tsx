import { useParams, Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { usePublicArticle } from '../../api/impact.js';

const CATEGORY_LABELS: Record<string, string> = {
  ngo: 'NGO',
  automation: 'Automation',
  general: 'Community',
};

const CATEGORY_COLOURS: Record<string, string> = {
  ngo: 'bg-teal-100 text-teal-800',
  automation: 'bg-purple-100 text-purple-800',
  general: 'bg-amber-100 text-amber-800',
};

// ---------------------------------------------------------------------------
// Inline markdown → JSX (bold, italic, inline code, links)
// ---------------------------------------------------------------------------
function parseInline(text: string, baseKey: number): React.ReactNode {
  const parts: React.ReactNode[] = [];
  // Order matters: **bold** before *italic*
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[2] !== undefined) {
      parts.push(<strong key={`${baseKey}-b${k++}`}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      parts.push(<em key={`${baseKey}-i${k++}`}>{m[3]}</em>);
    } else if (m[4] !== undefined) {
      parts.push(<code key={`${baseKey}-c${k++}`} className="rounded bg-sand-brand px-1 py-0.5 text-[13px] font-mono">{m[4]}</code>);
    } else if (m[5] !== undefined && m[6] !== undefined) {
      parts.push(<a key={`${baseKey}-a${k++}`} href={m[6]} target="_blank" rel="noopener noreferrer" className="text-teal-brand underline hover:opacity-80">{m[5]}</a>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  if (parts.length === 0) return text;
  if (parts.length === 1) return parts[0];
  return <>{parts}</>;
}

// ---------------------------------------------------------------------------
// Block-level markdown renderer
// ---------------------------------------------------------------------------
function SimpleMarkdown({ body }: { body: string }) {
  const lines = body.split('\n');
  const out: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    // Blank line
    if (!t) { out.push(<div key={key++} className="h-3" />); i++; continue; }

    // Headings
    if (t.startsWith('# '))   { out.push(<h1 key={key++} className="mt-8 mb-2 font-headline text-[28px] font-black text-charcoal-brand">{parseInline(t.slice(2), key)}</h1>); i++; continue; }
    if (t.startsWith('## '))  { out.push(<h2 key={key++} className="mt-8 mb-2 font-headline text-[22px] font-bold text-charcoal-brand">{parseInline(t.slice(3), key)}</h2>); i++; continue; }
    if (t.startsWith('### ')) { out.push(<h3 key={key++} className="mt-6 mb-1 font-headline text-[18px] font-bold text-charcoal-brand">{parseInline(t.slice(4), key)}</h3>); i++; continue; }

    // Blockquote — collect consecutive > lines
    if (t.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      out.push(
        <blockquote key={key++} className="my-4 border-l-4 border-teal-brand/40 bg-sand-brand/40 pl-4 pr-3 py-3 rounded-r-lg font-lato text-[15px] italic leading-relaxed text-charcoal-brand/75">
          {quoteLines.map((ql, qi) => <p key={qi}>{parseInline(ql, key + qi)}</p>)}
        </blockquote>
      );
      continue;
    }

    // Table — collect consecutive | lines, skip separator rows
    if (t.startsWith('|')) {
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        if (!/^\|[\s\-|:]+\|$/.test(row)) {
          tableRows.push(row.split('|').slice(1, -1).map((c) => c.trim()));
        }
        i++;
      }
      if (tableRows.length > 0) {
        const [head, ...body2] = tableRows;
        out.push(
          <div key={key++} className="my-4 overflow-x-auto rounded-xl border border-charcoal-brand/10">
            <table className="w-full text-left font-lato text-[14px]">
              <thead className="bg-sand-brand/60">
                <tr>{head.map((cell, ci) => <th key={ci} className="px-4 py-2.5 font-semibold text-charcoal-brand">{parseInline(cell, key + ci)}</th>)}</tr>
              </thead>
              <tbody>
                {body2.map((row, ri) => (
                  <tr key={ri} className="border-t border-charcoal-brand/8">
                    {row.map((cell, ci) => <td key={ci} className="px-4 py-2 text-charcoal-brand/75">{parseInline(cell, key + ri * 100 + ci)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Horizontal rule
    if (/^[-*]{3,}$/.test(t)) { out.push(<hr key={key++} className="my-6 border-charcoal-brand/10" />); i++; continue; }

    // Unordered list — collect consecutive - / * lines
    if (t.startsWith('- ') || t.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      out.push(
        <ul key={key++} className="my-2 ml-5 space-y-1.5 list-disc">
          {items.map((item, ii) => (
            <li key={ii} className="font-lato text-[15px] leading-relaxed text-charcoal-brand/80">
              {parseInline(item, key + ii)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Default paragraph
    out.push(
      <p key={key++} className="font-lato text-[15px] leading-[1.85] text-charcoal-brand/80">
        {parseInline(t, key)}
      </p>
    );
    i++;
  }

  return <div className="space-y-2">{out}</div>;
}

export default function ImpactArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: article, isLoading, isError } = usePublicArticle(slug ?? '');

  if (isLoading) {
    return (
      <PageLayout title="Loading… | Lola's Rentals">
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
        </div>
      </PageLayout>
    );
  }

  if (isError || !article) {
    return (
      <PageLayout title="Not Found | Lola's Rentals">
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="font-headline text-[24px] font-bold text-charcoal-brand">Article not found</p>
          <p className="font-lato text-[14px] text-charcoal-brand/60">
            This article may have been moved or removed.
          </p>
          <Link
            to="/book/impact"
            className="rounded-full bg-teal-brand px-6 py-2.5 font-lato text-[14px] font-bold text-white hover:bg-[#00496a]"
          >
            ← Back to Our Impact
          </Link>
        </div>
      </PageLayout>
    );
  }

  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-PH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  return (
    <PageLayout title={`${article.title} | Lola's Rentals`}>
      <SEO
        title={article.title}
        description={article.meta_description ?? article.excerpt ?? `Read about ${article.title} on the Lola's Rentals impact blog.`}
        canonical={`/book/impact/${article.slug}`}
        ogImage={article.featured_image_url ?? undefined}
      />

      <FadeUpSection>
        <article className="mx-auto max-w-3xl px-6 py-12">
          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-2 font-lato text-[12px] text-charcoal-brand/40">
            <Link to="/book/impact" className="hover:text-teal-brand transition-colors">Our Impact</Link>
            <span>/</span>
            <span className="text-charcoal-brand/60 truncate max-w-[200px]">{article.title}</span>
          </nav>

          {/* Metadata row */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_COLOURS[article.category] ?? CATEGORY_COLOURS.general}`}>
              {CATEGORY_LABELS[article.category] ?? article.category}
            </span>
            {article.ngos && (
              <span className="text-[12px] font-medium text-charcoal-brand/50">
                {article.ngos.name}
                {(article.ngos as { website_url?: string | null }).website_url && (
                  <>
                    {' · '}
                    <a
                      href={(article.ngos as { website_url: string }).website_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-teal-brand"
                    >
                      Website
                    </a>
                  </>
                )}
              </span>
            )}
            {date && <span className="ml-auto text-[12px] text-charcoal-brand/40">{date}</span>}
          </div>

          {/* Title */}
          <h1 className="font-headline text-[clamp(28px,4vw,40px)] font-black leading-tight text-charcoal-brand">
            {article.title}
          </h1>

          {/* Excerpt / sub-heading */}
          {article.excerpt && (
            <p className="mt-4 font-lato text-[17px] leading-relaxed text-charcoal-brand/65 border-l-4 border-teal-brand/30 pl-4">
              {article.excerpt}
            </p>
          )}

          {/* Tags */}
          {article.tags && article.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-charcoal-brand/10 bg-sand-brand/50 px-3 py-0.5 text-[11px] text-charcoal-brand/60">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Body */}
          {article.body_markdown && (
            <div className="mt-8 border-t border-charcoal-brand/10 pt-8">
              <SimpleMarkdown body={article.body_markdown} />
            </div>
          )}

          {/* Footer nav */}
          <div className="mt-12 border-t border-charcoal-brand/10 pt-8 flex items-center justify-between">
            <Link
              to="/book/impact"
              className="font-lato text-[13px] font-semibold text-teal-brand hover:underline"
            >
              ← Back to Our Impact
            </Link>
            <Link
              to="/book/reserve"
              className="rounded-full bg-teal-brand px-5 py-2 font-lato text-[13px] font-bold text-white hover:bg-[#00496a]"
            >
              Book a Rental
            </Link>
          </div>
        </article>
      </FadeUpSection>
    </PageLayout>
  );
}
