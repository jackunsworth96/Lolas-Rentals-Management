import { useState } from 'react';
import { Modal } from '../common/Modal.js';
import {
  useAccommodationAliases,
  useUpsertAccommodationAlias,
  useDeleteAccommodationAlias,
  type AccommodationAlias,
} from '../../api/dashboard.js';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Normalised raw names from current data that have no alias yet */
  unmatchedRawNames: string[];
}

export function AccommodationAliasModal({ open, onClose, unmatchedRawNames }: Props) {
  const { data: aliases = [], isLoading } = useAccommodationAliases();
  const upsert = useUpsertAccommodationAlias();
  const remove = useDeleteAccommodationAlias();

  const [rawName, setRawName] = useState('');
  const [canonicalName, setCanonicalName] = useState('');
  const [formError, setFormError] = useState('');

  const aliasedRawNames = new Set(aliases.map((a) => a.raw_name));

  const handleSave = async () => {
    setFormError('');
    if (!rawName.trim() || !canonicalName.trim()) {
      setFormError('Both fields are required.');
      return;
    }
    try {
      await upsert.mutateAsync({ rawName: rawName.trim(), canonicalName: canonicalName.trim() });
      setRawName('');
      setCanonicalName('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const handleDelete = async (alias: AccommodationAlias) => {
    if (!confirm(`Remove alias "${alias.raw_name}" → "${alias.canonical_name}"?`)) return;
    await remove.mutateAsync(alias.id);
  };

  const prefill = (name: string) => {
    setRawName(name);
    setCanonicalName('');
    setFormError('');
  };

  return (
    <Modal open={open} onClose={onClose} title="Accommodation Name Aliases" size="lg">
      <div className="space-y-6">
        <p className="text-sm text-gray-500">
          Map customer-entered accommodation names to a single canonical name so variations like
          "Mao Mao" and "Mao Mao Surf Resort" are grouped together in the referral stats.
        </p>

        {/* Unmatched names from current data */}
        {unmatchedRawNames.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
              Needs an alias ({unmatchedRawNames.length})
            </h3>
            <div className="rounded-lg border border-amber-200 bg-amber-50 divide-y divide-amber-100">
              {unmatchedRawNames.map((name) => (
                <div key={name} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-800">{name}</span>
                  <button
                    type="button"
                    onClick={() => prefill(name)}
                    className="text-xs font-medium text-teal-600 hover:underline"
                  >
                    Set alias →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add / edit alias form */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Add alias
          </h3>
          <div className="flex gap-3 flex-col sm:flex-row">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Customer entered (raw)</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                placeholder="e.g. mao mao surf"
                value={rawName}
                onChange={(e) => setRawName(e.target.value)}
              />
            </div>
            <div className="flex items-end pb-0.5 text-gray-400 hidden sm:block">→</div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">Canonical name (displayed)</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                placeholder="e.g. Mao Mao Surf Resort"
                value={canonicalName}
                onChange={(e) => setCanonicalName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleSave(); }}
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={upsert.isPending}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {upsert.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {formError && <p className="mt-1.5 text-xs text-red-600">{formError}</p>}
          <p className="mt-1.5 text-xs text-gray-400">
            The raw name is normalised to lowercase before matching — capitalisation doesn't matter.
          </p>
        </div>

        {/* Existing aliases */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Existing aliases {aliases.length > 0 && `(${aliases.length})`}
          </h3>
          {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
          {!isLoading && aliases.length === 0 && (
            <p className="text-sm text-gray-400">No aliases yet.</p>
          )}
          {!isLoading && aliases.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Raw name</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Canonical name</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((alias) => (
                    <tr key={alias.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2.5 text-gray-600">{alias.raw_name}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{alias.canonical_name}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(alias)}
                          disabled={remove.isPending}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {aliases.length > 0 && unmatchedRawNames.length === 0 && (
            <p className="mt-2 text-xs text-gray-400">
              All accommodation names from your data are aliased.
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
