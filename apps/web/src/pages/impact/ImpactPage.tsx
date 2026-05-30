import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';
import { FadeUpSection } from '../../components/public/FadeUpSection.js';
import { NgoImpactMeter } from '../../components/home/BePawsitiveMeter.js';
import { usePublicArticles, usePublicNgoTotals } from '../../api/impact.js';
import { formatPhpNumber } from '../../utils/currency.js';
import { PesoSign } from '../../components/ui/PesoSign.js';
import { CloudinaryImage } from '../../components/ui/CloudinaryImage.js';

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

function ArticleCard({ article }: { article: import('../../api/impact.js').ArticleListItem }) {
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <Link
      to={`/book/impact/${article.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-charcoal-brand/10 bg-white transition-shadow hover:shadow-lg"
    >
      {article.featured_image_url && (
        <div className="aspect-[16/9] overflow-hidden">
          <img
            src={article.featured_image_url}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${CATEGORY_COLOURS[article.category] ?? CATEGORY_COLOURS.general}`}>
            {CATEGORY_LABELS[article.category] ?? article.category}
          </span>
          {article.ngos && (
            <span className="text-[11px] text-charcoal-brand/50">{article.ngos.name}</span>
          )}
          {date && <span className="ml-auto text-[11px] text-charcoal-brand/40">{date}</span>}
        </div>
        <h3 className="mb-2 font-headline text-[17px] font-bold leading-snug text-charcoal-brand transition-colors group-hover:text-teal-brand">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="line-clamp-3 font-lato text-[13px] leading-relaxed text-charcoal-brand/65">
            {article.excerpt}
          </p>
        )}
        <p className="mt-auto pt-4 text-[12px] font-semibold text-teal-brand">Read more →</p>
      </div>
    </Link>
  );
}

function NgoTotalsSection() {
  const { data: totals } = usePublicNgoTotals();
  if (!totals || totals.length === 0) return null;

  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((ngo) => (
        <div
          key={ngo.id}
          className="flex items-center gap-4 rounded-xl border border-charcoal-brand/10 bg-white p-4"
        >
          {ngo.logoUrl ? (
            <img src={ngo.logoUrl} alt={ngo.name} className="h-10 w-10 shrink-0 rounded-full object-contain" />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xl">
              🐾
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-charcoal-brand">{ngo.name}</p>
            <p className="text-[12px] text-teal-brand font-medium">
              <PesoSign />{formatPhpNumber(ngo.totalDonated)} raised
            </p>
            {ngo.websiteUrl && (
              <a
                href={ngo.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-charcoal-brand/40 underline hover:text-teal-brand"
              >
                Visit website
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORIES = [
  { value: '', label: 'All' },
  { value: 'ngo', label: 'NGOs' },
  { value: 'automation', label: 'Automation' },
  { value: 'general', label: 'Community' },
];

const STATS = [
  { value: '1,601+', label: 'Animals Fixed' },
  { value: '2,746+', label: 'Vaccinated' },
  { value: 'Oct 2022', label: 'Partnership Began' },
];

export default function ImpactPage() {
  const [activeCategory, setActiveCategory] = useState('');
  const { data: articles, isLoading } = usePublicArticles(1, activeCategory || undefined);

  return (
    <PageLayout title="Our Impact | Lola's Rentals" fullBleed>
      <SEO
        title="Our Impact — Lola's Rentals Siargao"
        description="Every rental with Lola's Rentals funds local NGOs on Siargao. Read our latest articles on animal welfare, community projects, and how we're building a better island."
        canonical="/book/impact"
      />

      {/* ── Hero ── */}
      <div
        className="relative w-full overflow-hidden"
        style={{ minHeight: 'clamp(520px, 80vh, 860px)' }}
      >
        {/* Background photo */}
        <CloudinaryImage
          publicId="group_pic_nyangd"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: 'center 30%' }}
        />

        {/* Gradient overlay — dark at top, dark teal at bottom */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,30,45,0.72) 0%, rgba(0,60,90,0.55) 40%, rgba(0,87,124,0.88) 100%)',
          }}
        />

        {/* Content */}
        <div className="on-dark relative z-10 flex h-full min-h-[inherit] flex-col items-center justify-center px-6 pb-16 pt-24 text-center" style={{ color: 'white' }}>

          {/* Eyebrow */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 backdrop-blur-sm">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
              Lola&apos;s Rentals · Community Impact
            </span>
          </div>

          {/* Main headline */}
          <h1
            className="font-headline font-black text-white"
            style={{ fontSize: 'clamp(40px, 6vw, 80px)', lineHeight: 1.05, maxWidth: 760 }}
          >
            Giving Back
            <br />
            <span style={{ color: '#FCBC5A', fontStyle: 'italic' }}>to Siargao</span>
          </h1>

          <p
            className="mx-auto mt-5 font-lato text-white/80"
            style={{ fontSize: 'clamp(15px, 2vw, 18px)', lineHeight: 1.75, maxWidth: 580 }}
          >
            Every rental you book funds local NGOs and community programmes on the island.
            No greenwashing — just real, transparent support.
          </p>

          {/* Counter centrepiece */}
          <div
            className="mt-10 flex flex-col items-center rounded-3xl px-10 py-7"
            style={{
              background: 'rgba(0,87,124,0.55)',
              border: '1px solid rgba(255,255,255,0.25)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            <p style={{ fontFamily: 'inherit', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.75)', margin: 0 }}>
              Total raised for local NGOs
            </p>
            <p
              className="mt-1 font-headline font-black"
              style={{ fontSize: 'clamp(48px, 7vw, 80px)', lineHeight: 1, letterSpacing: '-0.02em', color: '#ffffff' }}
            >
              <PesoSign style={{ height: '0.48em', verticalAlign: '-0.05em' }} /><NgoImpactMeter />
            </p>
            <p style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>and counting — updated live</p>
          </div>

          {/* Stat pills */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center rounded-2xl px-5 py-3"
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                }}
              >
                <span className="font-headline text-[22px] font-black text-white" style={{ lineHeight: 1 }}>
                  {s.value}
                </span>
                <span className="mt-0.5 font-lato text-[11px] text-white/55">{s.label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/book/reserve"
              className="rounded-full font-lato font-bold transition-opacity hover:opacity-90"
              style={{
                background: '#FCBC5A',
                color: '#1a1a1a',
                padding: '14px 32px',
                fontSize: 15,
              }}
            >
              Book a Rental
            </Link>
            <a
              href="#articles"
              className="rounded-full border border-white/30 bg-white/10 px-8 py-3.5 font-lato text-[15px] font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
            >
              Read Our Stories ↓
            </a>
          </div>
        </div>
      </div>

      {/* ── NGO Breakdown ── */}
      <FadeUpSection>
        <section className="px-6 py-14" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <h2 className="font-headline text-[24px] font-bold text-charcoal-brand">
            Where your money goes
          </h2>
          <p className="mt-2 font-lato text-[14px] text-charcoal-brand/60">
            A breakdown of donations by NGO partner, updated in real time.
          </p>
          <NgoTotalsSection />
        </section>
      </FadeUpSection>

      {/* ── Articles ── */}
      <FadeUpSection>
        <section id="articles" className="bg-sand-brand/40 px-6 py-14">
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <h2 className="font-headline text-[24px] font-bold text-charcoal-brand">
              Latest from the field
            </h2>
            <p className="mt-2 mb-6 font-lato text-[14px] text-charcoal-brand/60">
              Articles on the NGOs we support, our technology, and life on Siargao.
            </p>

            {/* Category filter */}
            <div className="mb-8 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setActiveCategory(c.value)}
                  className={[
                    'rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors',
                    activeCategory === c.value
                      ? 'bg-teal-brand text-white'
                      : 'border border-charcoal-brand/15 bg-white text-charcoal-brand/70 hover:border-teal-brand/40',
                  ].join(' ')}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="flex justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-brand border-t-transparent" />
              </div>
            )}

            {!isLoading && articles && articles.length === 0 && (
              <div className="rounded-xl border border-charcoal-brand/10 bg-white py-16 text-center">
                <p className="font-lato text-[15px] text-charcoal-brand/50">
                  No articles yet — check back soon.
                </p>
              </div>
            )}

            {!isLoading && articles && articles.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {articles.map((a) => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            )}
          </div>
        </section>
      </FadeUpSection>

      {/* ── CTA ── */}
      <FadeUpSection>
        <section className="px-6 py-16 text-center">
          <h2 className="font-headline text-[24px] font-bold text-charcoal-brand">
            Want to contribute?
          </h2>
          <p className="mx-auto mt-3 max-w-md font-lato text-[14px] leading-relaxed text-charcoal-brand/60">
            Every booking automatically contributes — or add an optional donation at checkout. Either way, you&apos;re making a real difference.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/book/reserve"
              className="rounded-full bg-teal-brand px-7 py-3 font-lato text-[14px] font-bold text-white transition-colors hover:bg-[#00496a]"
            >
              Book a Rental
            </Link>
            <Link
              to="/book/bepawsitive"
              className="rounded-full border border-charcoal-brand/20 bg-white px-7 py-3 font-lato text-[14px] font-medium text-charcoal-brand/70 transition-colors hover:border-teal-brand/40 hover:text-teal-brand"
            >
              Be Pawsitive →
            </Link>
          </div>
        </section>
      </FadeUpSection>
    </PageLayout>
  );
}
