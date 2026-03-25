import { Link } from 'react-router-dom';

export default function PawCardConfirm() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Savings Logged!</h1>
        <p className="mb-6 text-gray-600">Your Paw Card entry has been recorded successfully.</p>
        <Link to="/paw-card" className="text-emerald-600 hover:underline">Back to Paw Card</Link>
      </div>
    </div>
  );
}
