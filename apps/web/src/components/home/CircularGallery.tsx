import { useEffect, useRef } from 'react';
import {
  Renderer,
  Camera,
  Transform,
  Mesh,
  Program,
  Texture,
} from 'ogl';
import { Plane } from 'ogl';
import type { OGLRenderingContext } from 'ogl';
import './CircularGallery.css';

// ── Helpers ────────────────────────────────────────────────────

function lerp(p1: number, p2: number, t: number): number {
  return p1 + (p2 - p1) * t;
}

function debounce(fn: (...args: unknown[]) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ── Types ──────────────────────────────────────────────────────

interface GalleryItem {
  image: string;
  text: string;
}

interface CircularGalleryProps {
  items?: GalleryItem[];
  bend?: number;
  textColor?: string;
  borderRadius?: number;
  font?: string;
  scrollSpeed?: number;
  scrollEase?: number;
}

// ── Shaders ────────────────────────────────────────────────────

const VERT = /* glsl */ `
  attribute vec3 position;
  attribute vec2 uv;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uBend;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    if (abs(uBend) > 0.0001) {
      float r     = 1.0 / uBend;
      float theta = pos.x * uBend;
      pos.x = r * sin(theta);
      pos.z = pos.z + r * (cos(theta) - 1.0);
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(tMap, vUv);
  }
`;

// ── Canvas texture builder ─────────────────────────────────────

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

async function buildItemCanvas(
  item: GalleryItem,
  pw: number,
  ph: number,
  fontStr: string,
  color: string,
  cornerRadius: number,
): Promise<HTMLCanvasElement> {
  const cv = document.createElement('canvas');
  cv.width = pw;
  cv.height = ph;
  const ctx = cv.getContext('2d');
  if (!ctx) return cv;

  // Rounded-rect clip
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cornerRadius, 0);
  ctx.lineTo(pw - cornerRadius, 0);
  ctx.arcTo(pw, 0, pw, cornerRadius, cornerRadius);
  ctx.lineTo(pw, ph - cornerRadius);
  ctx.arcTo(pw, ph, pw - cornerRadius, ph, cornerRadius);
  ctx.lineTo(cornerRadius, ph);
  ctx.arcTo(0, ph, 0, ph - cornerRadius, cornerRadius);
  ctx.lineTo(0, cornerRadius);
  ctx.arcTo(0, 0, cornerRadius, 0, cornerRadius);
  ctx.closePath();
  ctx.clip();

  // White card background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, pw, ph);

  // Icon occupies top 62 % of the card
  const iconAreaH = ph * 0.62;
  const pad = pw * 0.15;
  const iconSz = Math.min(pw - pad * 2, iconAreaH - pad * 2);
  const ix = (pw - iconSz) / 2;
  const iy = pad + Math.max(0, (iconAreaH - pad * 2 - iconSz) / 2);

  try {
    const img = await loadImg(item.image);
    ctx.drawImage(img, ix, iy, iconSz, iconSz);
  } catch {
    // Fallback circle placeholder
    ctx.fillStyle = '#f1e6d6';
    ctx.beginPath();
    ctx.arc(pw / 2, iconAreaH / 2, iconSz / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Label text centred in the lower 38 %
  ctx.font = fontStr;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelY = iconAreaH + (ph - iconAreaH) / 2;
  ctx.fillText(item.text, pw / 2, labelY, pw * 0.88);

  ctx.restore();
  return cv;
}

// ── Component ──────────────────────────────────────────────────

export default function CircularGallery({
  items = [],
  bend = 3,
  textColor = '#363737',
  borderRadius = 0.05,
  font = 'bold 24px sans-serif',
  scrollSpeed = 2,
  scrollEase = 0.05,
}: CircularGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || items.length === 0) return;

    // Mutable cleanup handles captured inside the async IIFE
    let running = true;
    let raf = 0;
    let teardown: (() => void) | null = null;

    void (async () => {
      // Ensure custom fonts are available before drawing canvas text
      await document.fonts.ready;
      if (!running) return;

      // ── Renderer ────────────────────────────────────────────
      const renderer = new Renderer({ alpha: true, antialias: true });
      const gl: OGLRenderingContext = renderer.gl;
      gl.clearColor(0, 0, 0, 0);

      const glCanvas = gl.canvas;
      glCanvas.style.position = 'absolute';
      glCanvas.style.inset = '0';
      container.appendChild(glCanvas);

      // ── Camera & scene ──────────────────────────────────────
      const camera = new Camera(gl, { fov: 35 });
      camera.position.z = 5;
      const scene = new Transform();

      // ── Resize ──────────────────────────────────────────────
      const doResize = () => {
        renderer.setSize(container.offsetWidth, container.offsetHeight);
        camera.perspective({
          aspect: gl.canvas.width / gl.canvas.height,
        });
      };
      doResize();
      const onResize = debounce(doResize, 100);
      window.addEventListener('resize', onResize as EventListener);

      // ── World-space card dimensions ──────────────────────────
      // visible height at z=0 with camera at z=5, fov=35°
      const fovRad = (35 * Math.PI) / 180;
      const visH = 2 * Math.tan(fovRad / 2) * camera.position.z;
      const worldH = visH * 0.52;
      const worldW = worldH * (512 / 640);
      const stride = worldW * 1.09; // card width + gap
      const totalW = items.length * stride;
      const half = totalW / 2;

      // ── Canvas textures ──────────────────────────────────────
      const cornerPx = borderRadius * 512;
      const canvases = await Promise.all(
        items.map((item) =>
          buildItemCanvas(item, 512, 640, font, textColor, cornerPx),
        ),
      );
      if (!running) return;

      // ── Geometry (shared among all cards) ────────────────────
      const geom = new Plane(gl, { width: worldW, height: worldH });

      // ── Meshes ───────────────────────────────────────────────
      type Node = { mesh: Mesh; base: number };
      const nodes: Node[] = canvases.map((cv, i) => {
        const tex = new Texture(gl, {
          image: cv,
          generateMipmaps: false,
          wrapS: gl.CLAMP_TO_EDGE,
          wrapT: gl.CLAMP_TO_EDGE,
        });
        const prog = new Program(gl, {
          vertex: VERT,
          fragment: FRAG,
          uniforms: {
            tMap: { value: tex },
            uBend: { value: bend },
          },
          transparent: true,
          cullFace: false,
        });
        const mesh = new Mesh(gl, { geometry: geom, program: prog });
        mesh.setParent(scene);
        return { mesh, base: i * stride };
      });

      // ── Scroll state ─────────────────────────────────────────
      let scroll = 0;
      let scrollTarget = 0;
      let isDragging = false;
      let lastPointerX = 0;

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        scrollTarget += (e.deltaY / 100) * scrollSpeed;
      };

      const onPointerDown = (e: PointerEvent) => {
        isDragging = true;
        lastPointerX = e.clientX;
        glCanvas.setPointerCapture(e.pointerId);
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPointerX;
        scrollTarget -= (dx / container.offsetWidth) * scrollSpeed * 5;
        lastPointerX = e.clientX;
      };

      const onPointerUp = (e: PointerEvent) => {
        isDragging = false;
        try {
          glCanvas.releasePointerCapture(e.pointerId);
        } catch {
          // pointer may have already been released
        }
      };

      glCanvas.addEventListener('wheel', onWheel, { passive: false });
      glCanvas.addEventListener('pointerdown', onPointerDown);
      glCanvas.addEventListener('pointermove', onPointerMove);
      glCanvas.addEventListener('pointerup', onPointerUp);
      glCanvas.addEventListener('pointercancel', onPointerUp);

      // ── Animation loop ───────────────────────────────────────
      const tick = () => {
        if (!running) return;
        raf = requestAnimationFrame(tick);
        scroll = lerp(scroll, scrollTarget, scrollEase);

        for (const { mesh, base } of nodes) {
          let x = base - scroll * stride;
          // Infinite wrap: keep in [-half, half]
          x = ((x + half) % totalW + totalW) % totalW - half;
          mesh.position.x = x;
        }

        renderer.render({ scene, camera });
      };
      tick();

      // ── Store teardown for sync cleanup ──────────────────────
      teardown = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize as EventListener);
        glCanvas.removeEventListener('wheel', onWheel);
        glCanvas.removeEventListener('pointerdown', onPointerDown);
        glCanvas.removeEventListener('pointermove', onPointerMove);
        glCanvas.removeEventListener('pointerup', onPointerUp);
        glCanvas.removeEventListener('pointercancel', onPointerUp);
        if (container.contains(glCanvas)) container.removeChild(glCanvas);
      };
    })();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (teardown) teardown();
    };
  }, [items, bend, textColor, borderRadius, font, scrollSpeed, scrollEase]);

  return <div ref={containerRef} className="circular-gallery" />;
}
