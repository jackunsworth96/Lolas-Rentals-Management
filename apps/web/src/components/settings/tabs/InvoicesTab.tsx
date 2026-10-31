import { useEffect, useState } from 'react';
import { useInvoiceSettings, useSaveInvoiceSettings, type InvoiceSettings } from '../../../api/invoices.js';
import { Button } from '../../common/Button.js';

const inputCls = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

export function InvoicesTab() {
  const { data, isLoading, error } = useInvoiceSettings();
  const save = useSaveInvoiceSettings();
  const [form, setForm] = useState<InvoiceSettings | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!form) return null;

  function set<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    await save.mutateAsync(form);
    setSaved(true);
  }

  const text = (key: 'address' | 'tin' | 'email' | 'phone' | 'paymentInstructions' | 'footerNote') => ({
    value: form[key] ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value || null),
  });

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Invoices</h2>
        <p className="text-sm text-gray-500">These details appear at the top of every invoice PDF.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-gray-700 sm:col-span-2">
          Business name
          <input className={inputCls} required value={form.legalName} onChange={(e) => set('legalName', e.target.value)} />
        </label>
        <label className="text-sm text-gray-700 sm:col-span-2">
          Address
          <textarea className={inputCls} rows={2} {...text('address')} />
        </label>
        <label className="text-sm text-gray-700">
          Phone
          <input className={inputCls} {...text('phone')} />
        </label>
        <label className="text-sm text-gray-700">
          Email
          <input className={inputCls} {...text('email')} />
        </label>
        <label className="text-sm text-gray-700">
          TIN
          <input className={inputCls} {...text('tin')} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.showLogo} onChange={(e) => set('showLogo', e.target.checked)} />
          Show logo on invoices
        </label>
        <label className="text-sm text-gray-700 sm:col-span-2">
          Payment instructions
          <textarea className={inputCls} rows={3} placeholder="e.g. GCash 0917 000 0000 (Lola's Rentals) or BPI account 1234-5678-90" {...text('paymentInstructions')} />
        </label>
        <label className="text-sm text-gray-700 sm:col-span-2">
          Footer note
          <input className={inputCls} placeholder="Thank you for choosing Lola's Rentals." {...text('footerNote')} />
        </label>
        <label className="text-sm text-gray-700">
          Number prefix
          <input className={inputCls} value={form.numberPrefix} onChange={(e) => set('numberPrefix', e.target.value)} />
        </label>
        <label className="text-sm text-gray-700">
          Next invoice number
          <input
            type="number"
            min={1}
            className={inputCls}
            value={form.nextNumber}
            onChange={(e) => set('nextNumber', Math.max(1, Number(e.target.value) || 1))}
          />
          <span className="mt-1 block text-xs text-gray-500">
            Next invoice: {form.numberPrefix}{String(form.nextNumber).padStart(4, '0')}
          </span>
        </label>
      </div>

      {save.error && <p className="text-sm text-red-600">{(save.error as Error).message}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" loading={save.isPending}>Save</Button>
        {saved && <span className="text-sm text-teal-700">Saved</span>}
      </div>
    </form>
  );
}
