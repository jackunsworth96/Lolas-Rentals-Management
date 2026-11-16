import { useEffect, useRef, useState } from 'react';

interface Props {
  onChange: (pngDataUrl: string | null) => void;
  height?: number;
}

/** Finger / mouse signature box. Emits a trimmed-size PNG data URL, or null when cleared. */
export function SignaturePad({ onChange, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const [empty, setEmpty] = useState(true);

  // Size the bitmap whenever the box gets real dimensions: inside a <dialog> it is 0 wide until showModal() runs.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(canvas.offsetWidth * ratio);
      const h = Math.round(height * ratio);
      if (width === 0 || (canvas.width === width && canvas.height === h)) return;
      canvas.width = width;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      if (hasInk.current) {
        hasInk.current = false;
        setEmpty(true);
        onChange(null);
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    hasInk.current = true;
    setEmpty(false);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    const canvas = canvasRef.current;
    if (canvas && hasInk.current) onChange(exportPng(canvas));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hasInk.current = false;
    setEmpty(true);
    onChange(null);
  }

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: 'none' }}
          className="block w-full cursor-crosshair"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          aria-label="Signature box"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Sign here with your finger or mouse
          </span>
        )}
        <div className="pointer-events-none absolute bottom-6 left-6 right-6 border-b border-gray-200" />
      </div>
      <div className="mt-1 flex justify-end">
        <button type="button" onClick={clear} disabled={empty} className="text-xs font-medium text-gray-500 hover:text-gray-800 disabled:opacity-40">
          Clear signature
        </button>
      </div>
    </div>
  );
}

/** Must stay under the 300k-character cap in AcknowledgePayslipSchema. */
const MAX_DATA_URL_LENGTH = 250_000;

/** Downscale to keep the stored image small; busy signatures are shrunk further until they fit. */
function exportPng(canvas: HTMLCanvasElement): string | null {
  if (canvas.width === 0 || canvas.height === 0) return null;
  let url = canvas.toDataURL('image/png');
  for (const maxW of [600, 450, 320, 240]) {
    const scale = Math.min(1, maxW / canvas.width);
    const out = document.createElement('canvas');
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    const ctx = out.getContext('2d');
    if (!ctx) return url;
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    url = out.toDataURL('image/png');
    if (url.length <= MAX_DATA_URL_LENGTH) break;
  }
  return url;
}
