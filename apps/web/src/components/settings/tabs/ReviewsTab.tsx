import { useState } from 'react';
import {
  useReviews,
  useSaveReview,
  useDeleteReview,
  type Review,
} from '../../../api/reviews.js';

type FormState = {
  id?: number;
  reviewerName: string;
  reviewerRole: string;
  starRating: string;
  comment: string;
  platform: string;
  date: string;
  sortOrder: string;
  isActive: boolean;
};

function emptyForm(): FormState {
  return {
    reviewerName: '',
    reviewerRole: '',
    starRating: '5',
    comment: '',
    platform: 'Google',
    date: '',
    sortOrder: '0',
    isActive: true,
  };
}

function truncComment(s: string, max = 60): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}...`;
}

function starsDisplay(n: number): string {
  return Array.from({ length: Math.min(5, Math.max(0, n)) }, () => '⭐').join('');
}

export function ReviewsTab() {
  const { data = [], isLoading } = useReviews();
  const save = useSaveReview();
  const del = useDeleteReview();

  const [modal, setModal] = useState<{ open: boolean; form: FormState }>({
    open: false,
    form: emptyForm(),
  });

  function openAdd() {
    setModal({ open: true, form: emptyForm() });
  }

  function openEdit(row: Review) {
    setModal({
      open: true,
      form: {
        id: row.id,
        reviewerName: row.reviewerName,
        reviewerRole: row.reviewerRole ?? '',
        starRating: String(row.starRating),
        comment: row.comment,
        platform: row.platform,
        date: row.date ?? '',
        sortOrder: String(row.sortOrder),
        isActive: row.isActive,
      },
    });
  }

  function closeModal() {
    setModal((m) => ({ ...m, open: false }));
  }

  async function submitForm() {
    const { form } = modal;
    const starRating = parseInt(form.starRating, 10);
    const sortOrder = form.sortOrder.trim() === '' ? 0 : parseInt(form.sortOrder, 10);
    if (!form.reviewerName.trim() || !form.comment.trim() || Number.isNaN(starRating) || starRating < 1 || starRating > 5 || Number.isNaN(sortOrder)) {
      return;
    }
    await save.mutateAsync({
      id: form.id,
      reviewerName: form.reviewerName.trim(),
      reviewerRole: form.reviewerRole.trim() || null,
      starRating,
      comment: form.comment.trim(),
      platform: form.platform.trim() || 'Google',
      date: form.date.trim() || null,
      sortOrder,
      isActive: form.isActive,
    });
    closeModal();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-lato text-lg font-semibold text-gray-900">Reviews</h2>
        <p className="font-lato mt-1 text-sm text-gray-500">
          Manage testimonials shown on the public homepage. Active reviews appear in the Reviews section (up to 10, by sort order).
        </p>
      </div>

      {isLoading ? (
        <p className="font-lato text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
          <table className="font-lato min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 font-medium text-gray-700">Reviewer</th>
                <th className="px-3 py-2 font-medium text-gray-700">Role</th>
                <th className="px-3 py-2 font-medium text-gray-700">Rating</th>
                <th className="px-3 py-2 font-medium text-gray-700">Comment</th>
                <th className="px-3 py-2 font-medium text-gray-700">Active</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">{row.reviewerName}</td>
                  <td className="px-3 py-2">{row.reviewerRole ?? '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{starsDisplay(row.starRating)}</td>
                  <td className="max-w-xs px-3 py-2 text-gray-600">{truncComment(row.comment)}</td>
                  <td className="px-3 py-2">{row.isActive ? 'Yes' : 'No'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      type="button"
                      className="font-lato text-blue-600 hover:underline"
                      onClick={() => openEdit(row)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="font-lato ml-2 text-red-600 hover:underline"
                      onClick={() => {
                        if (window.confirm('Delete this review?')) del.mutate(row.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        type="button"
        className="font-lato rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        onClick={openAdd}
      >
        Add review
      </button>

      {(save.error || del.error) && (
        <p className="font-lato text-sm text-red-600">{(save.error ?? del.error)?.message}</p>
      )}

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <h3 className="font-lato text-lg font-semibold text-gray-900">{modal.form.id != null ? 'Edit review' : 'Add review'}</h3>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Reviewer name *</span>
                <input
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.reviewerName}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, reviewerName: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Role</span>
                <input
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="e.g. Digital Nomad, Surfer"
                  value={modal.form.reviewerRole}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, reviewerRole: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Star rating (1–5) *</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.starRating}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, starRating: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Comment *</span>
                <textarea
                  rows={3}
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.comment}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, comment: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Platform</span>
                <input
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.platform}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, platform: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Date</span>
                <input
                  type="date"
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.date}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))}
                />
              </label>
              <label className="block">
                <span className="font-lato text-sm font-medium text-gray-700">Sort order</span>
                <input
                  type="number"
                  className="font-lato mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={modal.form.sortOrder}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, sortOrder: e.target.value } }))}
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={modal.form.isActive}
                  onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, isActive: e.target.checked } }))}
                />
                <span className="font-lato text-sm font-medium text-gray-700">Active (visible on website)</span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="font-lato rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="font-lato rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={save.isPending}
                onClick={() => void submitForm()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
