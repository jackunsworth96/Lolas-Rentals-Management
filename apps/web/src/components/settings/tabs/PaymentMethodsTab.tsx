import { usePaymentMethods, useSavePaymentMethod, useDeletePaymentMethod } from '../../../api/config.js';
import { ConfigSection, type FieldDef } from '../ConfigSection.js';

const columns = [
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'surchargePercent', header: 'Surcharge %', render: (r: Record<string, unknown>) => `${Number(r.surchargePercent ?? 0)}%` },
  { key: 'isDepositEligible', header: 'Deposit eligible', render: (r: Record<string, unknown>) => (r.isDepositEligible === false ? 'No' : 'Yes') },
  { key: 'isActive', header: 'Active', render: (r: Record<string, unknown>) => (r.isActive === false ? 'No' : 'Yes') },
];

const fields: FieldDef[] = [
  { key: 'id', label: 'ID (e.g. cash, gcash)', type: 'text', required: true, readOnlyOnEdit: true },
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'surchargePercent', label: 'Surcharge % (e.g. 5 for card fee)', type: 'number' },
  { key: 'isDepositEligible', label: 'Deposit eligible', type: 'boolean' },
  { key: 'isActive', label: 'Active', type: 'boolean' },
];

export function PaymentMethodsTab() {
  const { data, isLoading } = usePaymentMethods();
  const save = useSavePaymentMethod();
  const del = useDeletePaymentMethod();
  return (
    <ConfigSection
      title="Payment Methods"
      data={(data ?? []) as Record<string, unknown>[]}
      isLoading={isLoading}
      columns={columns}
      fields={fields}
      onSave={(row) => save.mutate(row)}
      onDelete={(id) => del.mutate(id)}
      isSaving={save.isPending}
      saveError={save.error as Error | null}
    />
  );
}
