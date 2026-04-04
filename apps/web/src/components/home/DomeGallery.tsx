import { useRef, useEffect, useCallback, useState } from 'react';
import { useDrag } from '@use-gesture/react';
import './DomeGallery.css';

interface DomeImage {
  src: string;
  alt?: string;
}

interface DomeGalleryProps {
  images?: DomeImage[];
  fit?: number;
  fitBasis?: 'auto' | 'min' | 'max' | 'width' | 'height';
  minRadius?: number;
  maxRadius?: number;
  padFactor?: number;
  overlayBlurColor?: string;
  maxVerticalRotationDeg?: number;
  dragSensitivity?: number;
  enlargeTransitionMs?: number;
  segments?: number;
  dragDampening?: number;
  openedImageWidth?: string;
  openedImageHeight?: string;
  imageBorderRadius?: string;
  openedImageBorderRadius?: string;
  grayscale?: boolean;
}

interface ItemCoord {
  x: number;
  y: number;
  sizeX: number;
  sizeY: number;
  src: string;
  alt: string;
}

// ── Pure utilities ────────────────────────────────────────────

const clamp = (v: number, min: number, max: number): number =>
  Math.min(Math.max(v, min), max);

const normalizeAngle = (d: number): number => ((d % 360) + 360) % 360;

const wrapAngleSigned = (deg: number): number => {
  const n = normalizeAngle(deg);
  return n > 180 ? n - 360 : n;
};

const getDataNumber = (el: HTMLElement, name: string, fallback: number): number => {
  const v = el.dataset[name];
  const n = parseFloat(v ?? '');
  return isNaN(n) ? fallback : n;
};

// ── Sphere geometry ───────────────────────────────────────────

function computeCoords(
  images: DomeImage[],
  radius: number,
  segments: number,
  padFactor: number,
): ItemCoord[] {
  const n = images.length;
  if (n === 0) return [];

  // Golden angle distributes points evenly across the sphere surface
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  // Tile size: derived from radius and segment density.
  // padFactor is a gap fraction — 0 = tiles just touching, 0.15 = 15% gap.
  // Higher segments → smaller tiles → more fit in view.
  const tileSize = (radius / Math.sqrt(segments)) / (1 + padFactor);

  return images.map((img, i) => {
    // Squash y-range to ±0.75 (≈ ±49° latitude) to keep tiles in the
    // equatorial zone where they appear square, not foreshortened.
    const rawY = n === 1 ? 0 : 1 - (2 * i) / (n - 1);
    const yNorm = rawY * 0.75;
    const latitude = (Math.asin(clamp(yNorm, -1, 1)) * 180) / Math.PI;
    const longitude = wrapAngleSigned((goldenAngle * i * 180) / Math.PI);

    return {
      x: longitude,
      y: latitude,
      sizeX: tileSize,
      sizeY: tileSize,
      src: img.src,
      alt: img.alt ?? '',
    };
  });
}

// ── Tile sub-component ────────────────────────────────────────

function DomeTile({
  coord,
  radius,
  imageBorderRadius,
  grayscale,
  onClick,
}: {
  coord: ItemCoord;
  radius: number;
  imageBorderRadius: string;
  grayscale: boolean;
  onClick: (el: HTMLDivElement) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (ref.current) onClick(ref.current);
    },
    [onClick],
  );

  return (
    <div
      ref={ref}
      className="dome-tile"
      style={{
        width: coord.sizeX,
        height: coord.sizeY,
        // Centre tile at sphere origin before 3-D transforms
        marginLeft: -coord.sizeX / 2,
        marginTop: -coord.sizeY / 2,
        // Place tile on sphere surface: longitude → latitude → outward
        transform: `rotateY(${coord.x}deg) rotateX(${coord.y}deg) translateZ(${radius}px)`,
        borderRadius: imageBorderRadius,
      }}
      onClick={handleClick}
    >
      <img
        src={coord.src}
        alt={coord.alt}
        style={{ filter: grayscale ? 'grayscale(100%)' : 'none' }}
        draggable={false}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────

export default function DomeGallery({
  images = [],
  fit = 0.8,
  fitBasis = 'auto',
  minRadius = 400,
  maxRadius = 1200,
  padFactor = 0.15,
  overlayBlurColor = '#363737',
  maxVerticalRotationDeg = 20,
  dragSensitivity = 0.3,
  enlargeTransitionMs = 400,
  segments = 34,
  dragDampening = 3,
  openedImageWidth = '280px',
  openedImageHeight = '360px',
  imageBorderRadius = '12px',
  openedImageBorderRadius = '16px',
  grayscale = false,
}: DomeGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const sphereRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const focusedElRef = useRef<HTMLDivElement | null>(null);

  const rotationRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const originalTilePositionRef = useRef<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const lockedRadiusRef = useRef<number | null>(null);
  const inertiaRAF = useRef<number | null>(null);

  // Reactive state
  const [radius, setRadius] = useState<number>(minRadius);
  const [focusedImage, setFocusedImage] = useState<DomeImage | null>(null);
  const [focusedFrom, setFocusedFrom] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [isFocusOpen, setIsFocusOpen] = useState(false);

  // ── Radius: recalculate whenever container resizes ──────────
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      const { width, height } = el.getBoundingClientRect();
      // Allow per-element override via data-segments / data-radius
      const segmentsOverride = getDataNumber(el, 'segments', segments);
      void segmentsOverride; // used for potential future data-attr config

      let basis: number;
      switch (fitBasis) {
        case 'width':  basis = width; break;
        case 'height': basis = height; break;
        case 'min':    basis = Math.min(width, height); break;
        case 'max':    basis = Math.max(width, height); break;
        default:       basis = Math.max(width, height);
      }
      const r = clamp(basis * fit, minRadius, maxRadius);
      setRadius(r);
      lockedRadiusRef.current = r;
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit, fitBasis, minRadius, maxRadius, segments]);

  // ── Apply current rotation to sphere DOM element ────────────
  const applyRotation = useCallback(() => {
    const sphere = sphereRef.current;
    if (!sphere) return;
    const rx = clamp(rotationRef.current.x, -maxVerticalRotationDeg, maxVerticalRotationDeg);
    sphere.style.transform = `rotateX(${rx}deg) rotateY(${rotationRef.current.y}deg)`;
  }, [maxVerticalRotationDeg]);

  // ── Inertia ─────────────────────────────────────────────────
  const stopInertia = useCallback(() => {
    if (inertiaRAF.current !== null) {
      cancelAnimationFrame(inertiaRAF.current);
      inertiaRAF.current = null;
    }
  }, []);

  const startInertia = useCallback(
    (velX: number, velY: number) => {
      stopInertia();
      // Higher dragDampening → faster decay (range ≈ 0.02–0.98)
      const decay = 1 - clamp(dragDampening / 30, 0.02, 0.98);
      let vx = velX;
      let vy = velY;

      const loop = () => {
        rotationRef.current.y += vx;
        rotationRef.current.x -= vy;
        applyRotation();
        vx *= decay;
        vy *= decay;
        if (Math.abs(vx) + Math.abs(vy) > 0.01) {
          inertiaRAF.current = requestAnimationFrame(loop);
        } else {
          inertiaRAF.current = null;
        }
      };
      inertiaRAF.current = requestAnimationFrame(loop);
    },
    [dragDampening, applyRotation, stopInertia],
  );

  // ── Drag gesture ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bind = useDrag(({ delta: [dx, dy], last, velocity: [vx, vy], first, xy: [x, y] }: any) => {
    if (focusedImage) return;

    if (first) {
      startPosRef.current = { x, y };
      stopInertia();
    }

    rotationRef.current.y += dx * dragSensitivity;
    rotationRef.current.x -= dy * dragSensitivity;
    applyRotation();

    if (last) {
      startPosRef.current = null;
      startInertia(vx * dragSensitivity * 10, vy * dragSensitivity * 10);
    }
  }, { filterTaps: true });

  // ── Focus / unfocus ──────────────────────────────────────────
  const closeFocused = useCallback(() => {
    setIsFocusOpen(false);
    setTimeout(() => {
      setFocusedImage(null);
      setFocusedFrom(null);
      focusedElRef.current = null;
    }, enlargeTransitionMs);
  }, [enlargeTransitionMs]);

  const handleTileClick = useCallback(
    (img: DomeImage, el: HTMLDivElement) => {
      if (focusedImage) {
        closeFocused();
        return;
      }
      const rect = el.getBoundingClientRect();
      const pos = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      originalTilePositionRef.current = pos;
      setFocusedFrom(pos);
      setFocusedImage(img);
      focusedElRef.current = el;
      // Delay one frame so React renders the img at `focusedFrom` before
      // toggling `isFocusOpen` which triggers the CSS transition to centre.
      requestAnimationFrame(() => setIsFocusOpen(true));
    },
    [focusedImage, closeFocused],
  );

  // Cleanup inertia on unmount
  useEffect(() => () => stopInertia(), [stopInertia]);

  // ── Derived values ────────────────────────────────────────────
  const coords = computeCoords(images, radius, segments, padFactor);
  const perspective = radius * 2.5;
  const openW = parseInt(openedImageWidth, 10);
  const openH = parseInt(openedImageHeight, 10);

  return (
    <div
      ref={rootRef}
      className="dome-root"
      style={{ ['--segments-x' as string]: segments } as React.CSSProperties}
      {...bind()}
    >
      <div ref={mainRef} className="dome-main">
        <div
          ref={frameRef}
          className="dome-frame"
          style={{ perspective: `${perspective}px` }}
        >
          <div ref={viewerRef} className="dome-viewer">
            <div ref={sphereRef} className="dome-sphere">
              {coords.map((coord, i) => (
                <DomeTile
                  key={i}
                  coord={coord}
                  radius={radius}
                  imageBorderRadius={imageBorderRadius}
                  grayscale={grayscale}
                  onClick={(el) => handleTileClick(images[i], el)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Blur scrim — covers full viewport when image is focused */}
      <div
        ref={scrimRef}
        className={`dome-scrim${focusedImage ? ' active' : ''}`}
        style={{ backgroundColor: overlayBlurColor }}
        onClick={closeFocused}
      />

      {/* Focused image — animates from tile rect to centre of viewport */}
      {focusedImage && focusedFrom && (
        <img
          className="dome-focused-img"
          src={focusedImage.src}
          alt={focusedImage.alt ?? ''}
          draggable={false}
          onClick={closeFocused}
          style={{
            left: isFocusOpen
              ? `calc(50vw - ${openW / 2}px)`
              : `${focusedFrom.left}px`,
            top: isFocusOpen
              ? `calc(50vh - ${openH / 2}px)`
              : `${focusedFrom.top}px`,
            width: isFocusOpen ? openedImageWidth : `${focusedFrom.width}px`,
            height: isFocusOpen ? openedImageHeight : `${focusedFrom.height}px`,
            borderRadius: isFocusOpen ? openedImageBorderRadius : imageBorderRadius,
            transition: `all ${enlargeTransitionMs}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
          }}
        />
      )}
    </div>
  );
}
