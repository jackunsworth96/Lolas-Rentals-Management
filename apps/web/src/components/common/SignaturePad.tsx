import { useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

export function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 248 || g < 248 || b < 248) return false;
  }
  return true;
}

function setupCanvasSize(canvas: HTMLCanvasElement, force = false) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (force || canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  }
}

interface SignaturePadProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onDrawingChange?: (hasInk: boolean) => void;
  className?: string;
}

export function SignaturePad({ canvasRef, onDrawingChange, className = 'h-[200px]' }: SignaturePadProps) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const refreshSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setupCanvasSize(canvas);
  }, [canvasRef]);

  useEffect(() => {
    refreshSize();
    const ro = new ResizeObserver(() => refreshSize());
    const canvas = canvasRef.current;
    if (canvas) ro.observe(canvas);
    return () => ro.disconnect();
  }, [canvasRef, refreshSize]);

  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return { x, y };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = getPos(e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    onDrawingChange?.(!isCanvasBlank(canvas));
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const canvas = canvasRef.current;
    if (canvas) onDrawingChange?.(!isCanvasBlank(canvas));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = false;
    last.current = null;
    setupCanvasSize(canvas, true);
    onDrawingChange?.(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className={`w-full ${className} touch-none rounded-lg border-2 border-charcoal-brand bg-white`}
        style={{ touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={(e) => {
          if (drawing.current) endStroke(e);
        }}
      />
      <ClearSignatureButton onClear={clear} />
    </div>
  );
}

function ClearSignatureButton({ onClear }: { onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="mt-2 font-lato text-sm text-teal-brand underline underline-offset-2"
      onClick={onClear}
    >
      {t('waiver.clearSignature')}
    </button>
  );
}
