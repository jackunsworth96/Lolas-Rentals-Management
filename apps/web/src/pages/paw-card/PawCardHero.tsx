import { Link } from 'react-router-dom';

export default function PawCardHero() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-4 text-4xl font-bold text-emerald-800">Paw Card</h1>
        <p className="mb-8 text-lg text-emerald-600">Save with local businesses during your rental adventure</p>
        <div className="flex flex-col gap-3">
          <Link to="/paw-card/log" className="rounded-lg bg-emerald-600 px-6 py-3 text-center font-medium text-white hover:bg-emerald-700">
            Log Your Savings
          </Link>
          <Link to="/paw-card/submissions" className="rounded-lg border border-emerald-300 px-6 py-3 text-center font-medium text-emerald-700 hover:bg-emerald-50">
            My Submissions
          </Link>
        </div>
      </div>
    </div>
  );
}
