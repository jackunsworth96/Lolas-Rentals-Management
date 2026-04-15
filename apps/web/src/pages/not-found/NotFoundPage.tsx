import { Link } from 'react-router-dom';
import { PageLayout } from '../../components/layout/PageLayout.js';
import { SEO } from '../../components/seo/SEO.js';

export default function NotFoundPage() {
  return (
    <PageLayout title="Page Not Found | Lola's Rentals" showFloralRight={false}>
      <SEO
        title="Page Not Found | Lola's Rentals"
        description="The page you are looking for does not exist."
        noIndex={true}
      />
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 text-6xl">🐾</div>
        <h1 className="font-headline text-4xl font-black text-teal-brand mb-3">
          Page Not Found
        </h1>
        <p className="text-charcoal-brand/70 font-lato text-base max-w-sm mb-8">
          Looks like this page took a wrong turn on the island. Let's get you back on track.
        </p>
        <Link
          to="/book"
          className="rounded-xl bg-teal-brand px-6 py-3 text-base font-bold text-white font-lato hover:bg-teal-700 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </PageLayout>
  );
}
