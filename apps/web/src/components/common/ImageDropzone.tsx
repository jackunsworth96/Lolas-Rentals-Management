import { useRef, useState, type DragEvent } from 'react';
import { compressImage } from '../../utils/compress-image.js';

const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';

interface ImageDropzoneProps {
  /** Receives the dropped or picked images, already resized and compressed. */
  onFiles: (files: File[]) => Promise<void> | void;
  multiple?: boolean;
  busy?: boolean;
  label?: string;
}

export function ImageDropzone({ onFiles, multiple = false, busy = false, label = 'Drag a picture here, or click to choose' }: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const working = busy || preparing;

  async function handle(list: FileList | null) {
    setError(null);
    const files = Array.from(list ?? []).filter((f) => ACCEPT.split(',').includes(f.type));
    if (files.length === 0) {
      if (list && list.length > 0) setError('Please choose a JPEG, PNG, WebP or GIF image.');
      return;
    }
    setPreparing(true);
    try {
      const compressed = await Promise.all((multiple ? files : files.slice(0, 1)).map((f) => compressImage(f)));
      await onFiles(compressed);
    } catch (err) {
      setError((err as Error).message || 'Upload failed');
    } finally {
      setPreparing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!working) void handle(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={working}
        onClick={() => !working && inputRef.current?.click()}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !working) inputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition-colors ${
          dragging ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-gray-300 text-gray-500 hover:border-gray-400'
        } ${working ? 'cursor-wait opacity-60' : ''}`}
      >
        {working ? 'Uploading…' : label}
        <span className="mt-1 text-xs text-gray-400">Images are resized and compressed automatically.</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => void handle(e.target.files)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
