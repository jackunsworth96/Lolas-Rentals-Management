import { Modal } from '../common/Modal.js';
import { Badge } from '../common/Badge.js';
import { useAccident } from '../../api/accidents.js';
import type { AccidentReport } from '../../api/accidents.js';

interface AccidentDetailModalProps {
  open: boolean;
  onClose: () => void;
  reportId: string;
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-2">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</p>
      </div>
      <dl className="divide-y divide-gray-100 px-4">{children}</dl>
    </div>
  );
}

function YesNo({ val, yesColor = 'red' }: { val: boolean; yesColor?: 'red' | 'amber' | 'blue' | 'green' }) {
  if (val) return <Badge color={yesColor}>Yes</Badge>;
  return <span className="text-gray-400 text-sm">No</span>;
}

export function AccidentDetailModal({ open, onClose, reportId }: AccidentDetailModalProps) {
  const { data: report, isLoading } = useAccident(reportId);
  const r = report as AccidentReport | undefined;

  if (!open) return null;

  if (isLoading || !r) {
    return (
      <Modal open onClose={onClose} title="Accident Report" size="xl">
        <div className="py-8 text-center text-gray-500">Loading...</div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Accident Report" size="xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3 text-sm text-gray-500">
        <span>Logged {formatDt(r.createdAt)}</span>
        {r.reportedByName && <span>· {r.reportedByName}</span>}
      </div>

      <div className="max-h-[65vh] space-y-3 overflow-y-auto">
        <Section title="Report Details">
          <Field label="Report ID" value={<span className="font-mono text-xs">{r.id}</span>} />
          <Field label="Order Reference" value={<span className="font-mono text-xs">{r.orderReference ?? '—'}</span>} />
          <Field label="Customer" value={r.customerName ?? '—'} />
          <Field label="Peace of Mind Cover" value={
            r.peaceOfMindActive === true ? <Badge color="green">Active</Badge> :
            r.peaceOfMindActive === false ? <span className="text-gray-400 text-sm">Not purchased</span> :
            '—'
          } />
        </Section>

        <Section title="Vehicle">
          <Field label="Vehicle" value={
            r.fleet
              ? `${r.fleet.name}${r.fleet.plateNumber ? ` — ${r.fleet.plateNumber}` : ''}`
              : '—'
          } />
        </Section>

        <Section title="Incident">
          <Field label="Date &amp; Time of Accident" value={formatDt(r.accidentAt)} />
          {r.location && <Field label="Location" value={r.location} />}
          <Field label="How it happened" value={
            <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{r.description}</p>
          } />
        </Section>

        {r.damageDescription && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700 mb-1">Vehicle Damage</p>
            <p className="text-sm text-red-900 whitespace-pre-wrap">{r.damageDescription}</p>
          </div>
        )}

        <Section title="Customer Welfare">
          <Field label="Injured" value={<YesNo val={r.customerInjured} />} />
          {r.customerInjured && r.injuryDescription && (
            <Field label="Injury details" value={r.injuryDescription} />
          )}
          <Field label="Medical attention" value={<YesNo val={r.medicalAttention} yesColor="amber" />} />
          <Field label="Emergency services called" value={<YesNo val={r.emergencyServicesCalled} />} />
          <Field label="Police report filed" value={
            r.policeReportFiled ? (
              <span className="text-sm text-gray-900">
                Yes{r.policeReportNumber ? ` — ${r.policeReportNumber}` : ''}
              </span>
            ) : <YesNo val={false} />
          } />
          <Field label="Helmets at time of accident" value={r.helmetsWorn || '—'} />
        </Section>

        {r.thirdPartyNotes && (
          <Section title="Third-Party Notes">
            <Field label="" value={r.thirdPartyNotes} />
          </Section>
        )}

        <Section title="Evidence">
          <Field label="Photos" value={r.photoUrls.length > 0 ? `${r.photoUrls.length} photo${r.photoUrls.length === 1 ? '' : 's'}` : 'None'} />
          <Field label="Customer signature" value={r.customerSignatureUrl ? (
            <img src={r.customerSignatureUrl} alt="Customer signature" className="mt-1 h-16 rounded border border-gray-200 bg-white" />
          ) : 'Not captured'} />
          {r.additionalNotes && <Field label="Additional notes" value={r.additionalNotes} />}
        </Section>

        {r.photoUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {r.photoUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt={`Photo ${i + 1}`}
                  className="h-24 w-full rounded-lg border border-gray-200 object-cover hover:opacity-90"
                />
              </a>
            ))}
          </div>
        )}

        {r.tamperHash && (
          <div className="rounded-lg bg-gray-900 p-4">
            <p className="text-[10px] font-mono text-gray-400 mb-1">TAMPER-EVIDENT HASH (SHA-256)</p>
            <p className="font-mono text-xs text-amber-400 break-all">{r.tamperHash}</p>
            <p className="mt-2 text-[10px] text-gray-500">
              Hash derived from report ID, order ref, vehicle name, plate number, accident time and logged-at timestamp.
              {r.hashEmailedAt && ` Emailed at ${formatDt(r.hashEmailedAt)}.`}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
