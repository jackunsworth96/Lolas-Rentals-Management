import { useEffect, useRef, useCallback, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

export function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    if (r < 248 || g < 248 || b < 248) return false;
  }
  return true;
}

function applyPenStyle(ctx: CanvasRenderingContext2D, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/**
 * Matches the bitmap to the element's on-screen size. Returns false while the
 * element has no layout yet (hidden tab, unmounted step, closed dialog) so a
 * 0-wide measurement never leaves a 1px bitmap behind.
 */
function syncCanvasSize(canvas: HTMLCanvasElement, opts: { force?: boolean; keepInk?: boolean } = {}): boolean {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (!opts.force && canvas.width === w && canvas.height === h) return true;

  let snapshot: HTMLCanvasElement | null = null;
  if (opts.keepInk && canvas.width > 1 && canvas.height > 1) {
    snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d')?.drawImage(canvas, 0, 0);
  }

  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  if (snapshot) ctx.drawImage(snapshot, 0, 0, w, h);
  applyPenStyle(ctx, dpr);
  return true;
}

interface SignaturePadProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onDrawingChange?: (hasInk: boolean) => void;
  className?: string;
}

export function SignaturePad({ canvasRef, onDrawingChange, className = 'h-[200px]' }: SignaturePadProps) {
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const hasInk = useRef(false);
  const onDrawingChangeRef = useRef(onDrawingChange);
  onDrawingChangeRef.current = onDrawingChange;

  const refreshSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || drawing.current) return;
    syncCanvasSize(canvas, { keepInk: true });
  }, [canvasRef]);

  useEffect(() => {
    refreshSize();
    const ro = new ResizeObserver(() => refreshSize());
    const canvas = canvasRef.current;
    if (canvas) ro.observe(canvas);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshSize();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', refreshSize);
    window.addEventListener('orientationchange', refreshSize);
    window.addEventListener('resize', refreshSize);
    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', refreshSize);
      window.removeEventListener('orientationchange', refreshSize);
      window.removeEventListener('resize', refreshSize);
    };
  }, [canvasRef, refreshSize]);

  const getPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    if (!syncCanvasSize(canvas, { keepInk: true })) return;
    const ctx = canvas.getContext('2d');
    if (ctx) applyPenStyle(ctx, window.devicePixelRatio || 1);
    canvas.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = getPos(e);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk.current) {
      hasInk.current = true;
      onDrawingChangeRef.current?.(true);
    }
  };

  const endStroke = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onDrawingChangeRef.current?.(hasInk.current);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = false;
    last.current = null;
    hasInk.current = false;
    syncCanvasSize(canvas, { force: true });
    onDrawingChangeRef.current?.(false);
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
        onPointerLeave={endStroke}
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
