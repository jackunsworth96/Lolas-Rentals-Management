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

/** Render markdown body as simple HTML paragraphs / headings without a full markdown library. */
function SimpleMarkdown({ body }: { body: string }) {
  const lines = body.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<div key={key++} className="h-4" />);
    } else if (trimmed.startsWith('### ')) {
      elements.push(<h3 key={key++} className="mt-6 font-headline text-[20px] font-bold text-charcoal-brand">{trimmed.slice(4)}</h3>);
    } else if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={key++} className="mt-8 font-headline text-[24px] font-bold text-charcoal-brand">{trimmed.slice(3)}</h2>);
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={key++} className="mt-8 font-headline text-[28px] font-bold text-charcoal-brand">{trimmed.slice(2)}</h1>);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <li key={key++} className="ml-4 font-lato text-[15px] leading-relaxed text-charcoal-brand/80 list-disc">
          {trimmed.slice(2)}
        </li>
      );
    } else {
      elements.push(
        <p key={key++} className="font-lato text-[15px] leading-[1.85] text-charcoal-brand/80">
          {trimmed}
        </p>
      );
    }
  }
  return <div className="space-y-3">{elements}</div>;
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

      {/* Hero image */}
      {article.featured_image_url && (
        <div className="w-full overflow-hidden" style={{ maxHeight: 480 }}>
          <img
            src={article.featured_image_url}
            alt={article.title}
            className="h-full w-full object-cover"
            style={{ maxHeight: 480 }}
          />
        </div>
      )}

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
