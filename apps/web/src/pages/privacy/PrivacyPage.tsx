import { Link } from 'react-router-dom';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream-brand px-6 py-24 font-body">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="mb-4 font-headline text-2xl font-black text-teal-brand">Privacy</h1>
        <p className="text-charcoal-brand/70">Our privacy policy will appear here soon.</p>
        <Link to="/" className="mt-8 inline-block font-bold text-teal-brand underline">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
