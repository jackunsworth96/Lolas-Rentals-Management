import { Modal } from '../common/Modal.js';
import { formatDateTime } from '../../utils/date.js';
import type { SignedWaiverDetails } from '../../api/waivers.js';

interface WaiverViewModalProps {
  open: boolean;
  onClose: () => void;
  orderReference: string;
  details: SignedWaiverDetails | undefined;
  loading: boolean;
  error: Error | null;
}

export function WaiverViewModal({ open, onClose, orderReference, details, loading, error }: WaiverViewModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Signed Waiver" size="lg">
      <div className="space-y-5">
        {/* Reference */}
        <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2.5">
          <span className="text-green-700 text-sm font-medium">Reference: {orderReference}</span>
        </div>

        {loading && (
          <p className="py-8 text-center text-sm text-gray-500">Loading waiver details…</p>
        )}

        {error && (
          <p className="py-4 text-center text-sm text-red-600">
            Could not load waiver details: {error.message}
          </p>
        )}

        {details && !loading && (
          <>
            {/* Signer info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
              <div>
                <div className="text-xs font-medium uppercase text-gray-500">Signed by</div>
                <div className="mt-0.5 font-semibold text-gray-900">{details.driverName}</div>
              </div>
              {details.driverEmail && (
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Email</div>
                  <div className="mt-0.5 text-gray-800">{details.driverEmail}</div>
                </div>
              )}
              {details.driverMobile && (
                <div>
                  <div className="text-xs font-medium uppercase text-gray-500">Mobile</div>
                  <div className="mt-0.5 text-gray-800">{details.driverMobile}</div>
                </div>
              )}
              <div>
                <div className="text-xs font-medium uppercase text-gray-500">Signed at</div>
                <div className="mt-0.5 text-gray-800">{formatDateTime(details.agreedAt)}</div>
              </div>
              {details.referralSource && (
                <div className="col-span-2">
                  <div className="text-xs font-medium uppercase text-gray-500">Heard about us via</div>
                  <div className="mt-0.5 text-gray-800 capitalize">{details.referralSource.replace(/_/g, ' ')}</div>
                </div>
              )}
            </div>

            {/* Driver signature */}
            {details.driverSignatureUrl && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-500">Driver Signature</div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <img
                    src={details.driverSignatureUrl}
                    alt="Driver signature"
                    className="mx-auto max-h-32 object-contain"
                  />
                </div>
              </div>
            )}

            {/* Passenger signatures */}
            {details.passengerSignatures.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-500">
                  Passenger Signatures ({details.passengerSignatures.length})
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {details.passengerSignatures.map((sig, idx) => (
                    <div key={idx} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="mb-1 text-xs text-gray-400">Passenger {idx + 1}</div>
                      <img
                        src={sig}
                        alt={`Passenger ${idx + 1} signature`}
                        className="mx-auto max-h-24 object-contain"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Licence photos */}
            {(details.licenceFrontUrl || details.licenceBackUrl) && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase text-gray-500">Licence Photos</div>
                <div className="grid grid-cols-2 gap-3">
                  {details.licenceFrontUrl && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="mb-1 text-xs text-gray-400">Front</div>
                      <img
                        src={details.licenceFrontUrl}
                        alt="Licence front"
                        className="mx-auto max-h-40 w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  {details.licenceBackUrl && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="mb-1 text-xs text-gray-400">Back</div>
                      <img
                        src={details.licenceBackUrl}
                        alt="Licence back"
                        className="mx-auto max-h-40 w-full object-contain"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
