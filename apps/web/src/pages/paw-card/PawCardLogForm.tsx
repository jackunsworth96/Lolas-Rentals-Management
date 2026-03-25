import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/common/Button.js';
import { api } from '../../api/client.js';

export default function PawCardLogForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', establishmentId: '', discountAmount: '', visitDate: '' });
  const [loading, setLoading] = useState(false);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/paw-card/submit', {
        customerId: form.email,
        establishmentId: form.establishmentId,
        discountAmount: Number(form.discountAmount),
        visitDate: form.visitDate,
        storeId: 'default',
      });
      navigate('/paw-card/confirm');
    } catch {
      alert('Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Log Savings</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input placeholder="Email" type="email" required value={form.email} onChange={(e) => set('email', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Establishment" required value={form.establishmentId} onChange={(e) => set('establishmentId', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Amount Saved" type="number" step="0.01" required value={form.discountAmount} onChange={(e) => set('discountAmount', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <input type="date" required value={form.visitDate} onChange={(e) => set('visitDate', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <Button type="submit" loading={loading} className="w-full">Submit</Button>
        </form>
      </div>
    </div>
  );
}
