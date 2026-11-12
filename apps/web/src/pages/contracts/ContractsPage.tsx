import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CONTRACT_CATEGORY_LABELS,
  ContractCategorySchema,
  ContractCounterpartyTypeSchema,
  type ContractCategory,
  type ContractStatus,
} from '@lolas/shared';
import { Table } from '../../components/common/Table.js';
import { Button } from '../../components/common/Button.js';
import { Badge } from '../../components/common/Badge.js';
import { ContractBuilderModal, type ContractBuilderInitial } from '../../components/contracts/ContractBuilderModal.js';
import { ContractDetailModal } from '../../components/contracts/ContractDetailModal.js';
import { TemplateEditorModal } from '../../components/contracts/TemplateEditorModal.js';
import { STARTER_CONTRACT_TEMPLATES } from '../../components/contracts/starterTemplates.js';
import { ContractStatusBadge, allowedContractCategories, fmtContractDateTime } from '../../components/contracts/contract-ui.js';
import {
  useContracts,
  useContractTemplates,
  useSaveContractTemplate,
  type Contract,
  type ContractTemplate,
} from '../../api/contracts.js';
import { useAuthStore } from '../../stores/auth-store.js';

const inputCls = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500';

function ContractsTab({ onOpen, onNew }: { onOpen: (id: string) => void; onNew: () => void }) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const categories = allowedContractCategories(permissions);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ContractStatus | ''>('');
  const [category, setCategory] = useState<ContractCategory | ''>('');
  const { data: contracts = [], isLoading, error } = useContracts({ q, status: status || undefined, category: category || undefined });

  const columns = [
    {
      key: 'title',
      header: 'Contract',
      cellClassName: 'whitespace-normal',
      render: (r: Contract) => (
        <div>
          <p className="font-medium text-gray-900">{r.title}</p>
          <p className="text-xs text-gray-500">{CONTRACT_CATEGORY_LABELS[r.category]}</p>
        </div>
      ),
    },
    {
      key: 'recipient',
      header: 'Signer',
      cellClassName: 'whitespace-normal',
      render: (r: Contract) => (
        <div>
          <p>{r.recipientName}</p>
          {r.counterpartyName && r.counterpartyName !== r.recipientName && <p className="text-xs text-gray-500">{r.counterpartyName}</p>}
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (r: Contract) => <ContractStatusBadge status={r.status} /> },
    { key: 'sent', header: 'Sent', render: (r: Contract) => fmtContractDateTime(r.sentAt) },
    { key: 'signed', header: 'Signed', render: (r: Contract) => fmtContractDateTime(r.signedAt) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputCls} w-full max-w-sm`} placeholder="Search title, signer or email…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value as ContractCategory | '')}>
          <option value="">All types</option>
          {categories.map((c) => <option key={c} value={c}>{CONTRACT_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as ContractStatus | '')}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="viewed">Viewed</option>
          <option value="completed">Signed</option>
          <option value="expired">Link expired</option>
          <option value="voided">Void</option>
        </select>
        <Button className="ml-auto" onClick={onNew}>New contract</Button>
      </div>
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading contracts…</p>
      ) : (
        <Table
          columns={columns}
          data={contracts}
          keyFn={(r) => r.id}
          onRowClick={(r) => onOpen(r.id)}
          getRowClassName={(r) => (r.status === 'voided' ? 'text-gray-400' : '')}
          emptyMessage="No contracts yet"
        />
      )}
    </div>
  );
}

function TemplatesTab({ onEdit, onUse }: { onEdit: (t: ContractTemplate | null) => void; onUse: (t: ContractTemplate) => void }) {
  const permissions = useAuthStore((s) => s.user?.permissions ?? []);
  const categories = allowedContractCategories(permissions);
  const { data: templates = [], isLoading } = useContractTemplates(true);
  const save = useSaveContractTemplate();
  const [seedError, setSeedError] = useState<string | null>(null);

  const starters = STARTER_CONTRACT_TEMPLATES.filter((s) => categories.includes(s.category) && !templates.some((t) => t.name === s.name));

  async function addStarters() {
    setSeedError(null);
    try {
      for (const s of starters) await save.mutateAsync(s);
    } catch (err) {
      setSeedError((err as Error).message);
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Template',
      cellClassName: 'whitespace-normal',
      render: (t: ContractTemplate) => (
        <div>
          <p className="font-medium text-gray-900">{t.name}</p>
          {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
        </div>
      ),
    },
    { key: 'category', header: 'Type', render: (t: ContractTemplate) => CONTRACT_CATEGORY_LABELS[t.category] },
    { key: 'fields', header: 'Fields', render: (t: ContractTemplate) => t.placeholders.length },
    { key: 'version', header: 'Version', render: (t: ContractTemplate) => `v${t.version}` },
    { key: 'active', header: 'Status', render: (t: ContractTemplate) => (t.isActive ? <Badge color="green">Active</Badge> : <Badge>Archived</Badge>) },
    {
      key: 'actions',
      header: '',
      render: (t: ContractTemplate) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); onEdit(t); }}>Edit</Button>
          {t.isActive && <Button size="sm" onClick={(e) => { e.stopPropagation(); onUse(t); }}>Use</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-gray-500">Write each contract once, with placeholders for the details that change per person.</p>
        <div className="ml-auto flex gap-2">
          {starters.length > 0 && (
            <Button variant="secondary" loading={save.isPending} onClick={() => void addStarters()}>
              Add {starters.length} starter template{starters.length === 1 ? '' : 's'}
            </Button>
          )}
          <Button onClick={() => onEdit(null)}>New template</Button>
        </div>
      </div>
      {seedError && <p className="text-sm text-red-600">{seedError}</p>}
      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-500">Loading templates…</p>
      ) : (
        <Table columns={columns} data={templates} keyFn={(t) => t.id} onRowClick={(t) => onEdit(t)} emptyMessage="No templates yet" />
      )}
    </div>
  );
}

/** Reads `?new=1&category=…&counterpartyType=…&counterpartyId=…` links from partner and employee screens. */
function initialFromParams(params: URLSearchParams): ContractBuilderInitial | null {
  if (params.get('new') !== '1') return null;
  const category = ContractCategorySchema.safeParse(params.get('category'));
  const counterpartyType = ContractCounterpartyTypeSchema.safeParse(params.get('counterpartyType'));
  return {
    category: category.success ? category.data : undefined,
    counterpartyType: counterpartyType.success ? counterpartyType.data : undefined,
    counterpartyId: params.get('counterpartyId') ?? undefined,
  };
}

export default function ContractsPage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'contracts' | 'templates'>('contracts');
  const [builder, setBuilder] = useState<{ contractId: string | null; initial?: ContractBuilderInitial } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(params.get('open'));
  const [templateEditor, setTemplateEditor] = useState<{ template: ContractTemplate | null } | null>(null);

  useEffect(() => {
    const initial = initialFromParams(params);
    if (initial) {
      setBuilder({ contractId: null, initial });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
        <p className="text-sm text-gray-500">Create agreements from templates, sign them for Lola's, and send a link for the other side to sign.</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['contracts', 'templates'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-teal-brand text-teal-brand' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'contracts' ? (
        <ContractsTab onOpen={setDetailId} onNew={() => setBuilder({ contractId: null })} />
      ) : (
        <TemplatesTab
          onEdit={(template) => setTemplateEditor({ template })}
          onUse={(t) => setBuilder({ contractId: null, initial: { category: t.category, templateId: t.id } })}
        />
      )}

      {builder && (
        <ContractBuilderModal
          contractId={builder.contractId}
          initial={builder.initial}
          onClose={() => setBuilder(null)}
          onSaved={(c) => { setBuilder(null); setTab('contracts'); setDetailId(c.id); }}
        />
      )}
      {detailId && (
        <ContractDetailModal
          contractId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={(id) => { setDetailId(null); setBuilder({ contractId: id }); }}
        />
      )}
      {templateEditor && <TemplateEditorModal template={templateEditor.template} onClose={() => setTemplateEditor(null)} />}
    </div>
  );
}
