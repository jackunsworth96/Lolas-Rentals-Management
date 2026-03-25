import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client.js';
import { Table } from '../../components/common/Table.js';
import { formatCurrency } from '../../utils/currency.js';
import { formatDate } from '../../utils/date.js';
import { Button } from '../../components/common/Button.js';

export default function PawCardSubmissions() {
  const [email, setEmail] = useState('');
  const [searchEmail, setSearchEmail] = useState('');

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['paw-card-submissions', searchEmail],
    queryFn: () => api.get(`/paw-card/my-submissions?email=${searchEmail}`),
    enabled: !!searchEmail,
  }) as { data: any[]; isLoading: boolean };

  const columns = [
    { key: 'visitDate', header: 'Date', render: (r: any) => formatDate(r.visitDate ?? r.createdAt) },
    { key: 'establishmentName', header: 'Establishment' },
    { key: 'discountAmount', header: 'Saved', render: (r: any) => formatCurrency(r.discountAmount ?? 0) },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 p-4">
      <div className="w-full max-w-lg">
        <h1 className="mb-6 text-center text-2xl font-bold text-gray-900">My Submissions</h1>
        <form onSubmit={(e) => { e.preventDefault(); setSearchEmail(email); }} className="mb-6 flex gap-2">
          <input placeholder="Enter your email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          <Button type="submit">Search</Button>
        </form>
        {isLoading ? <p className="text-center text-gray-500">Loading...</p>
          : submissions ? <Table columns={columns} data={submissions} keyFn={(r: any) => String(r.id)} emptyMessage="No submissions found" />
          : null}
      </div>
    </div>
  );
}
