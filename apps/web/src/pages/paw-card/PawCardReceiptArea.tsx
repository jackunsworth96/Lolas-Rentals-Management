import type { RefObject } from 'react';
import { PrimaryCtaButton } from '../../components/public/PrimaryCtaButton.js';

type Props = {
  galleryRef: RefObject<HTMLInputElement | null>;
  cameraRef: RefObject<HTMLInputElement | null>;
  receiptPreview: string | null;
  uploadError: string;
  onFileChange: (file: File | null) => void;
  onClearReceipt: () => void;
};

export function PawCardReceiptArea({
  galleryRef,
  cameraRef,
  receiptPreview,
  uploadError,
  onFileChange,
  onClearReceipt,
}: Props) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5 ml-1">Receipt Photo</label>
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="flex flex-col gap-2 mb-2">
        <PrimaryCtaButton type="button" onClick={() => galleryRef.current?.click()} className="w-full py-2.5 text-sm">
          Upload from Gallery
        </PrimaryCtaButton>
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="w-full py-2.5 rounded-full text-sm font-bold transition-all duration-300 ease-in-out hover:scale-[1.02]"
          style={{ background: '#eae1d2', color: '#1A7A6E' }}
        >
          Take a Photo
        </button>
      </div>

      {receiptPreview ? (
        <div className="relative rounded-lg overflow-hidden border-2 border-dashed" style={{ borderColor: '#1A7A6E' }}>
          <img src={receiptPreview} alt="Receipt preview" className="w-full h-40 object-cover" />
          <button
            type="button"
            onClick={onClearReceipt}
            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center text-sm font-bold transition-all duration-300 ease-in-out hover:bg-black/80 hover:scale-105"
          >
            ×
          </button>
        </div>
      ) : (
        <div
          role="presentation"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onFileChange(e.dataTransfer.files?.[0] ?? null);
          }}
          className="w-full border-2 border-dashed rounded-lg p-4 text-center transition-transform duration-200 focus-within:scale-[1.01]"
          style={{ borderColor: '#bdc9c5' }}
        >
          <p className="text-xs" style={{ color: '#6e7976' }}>
            Or drag a photo here
          </p>
        </div>
      )}
      {uploadError && <p className="text-xs text-red-600 mt-1">{uploadError}</p>}
    </div>
  );
}
