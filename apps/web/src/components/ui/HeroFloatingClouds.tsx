import { CloudShape } from './CloudShape.js';

export type HeroCloudVariant = 'home' | 'editorial' | 'functional';

const HOME_OPACITY = ['opacity-70', 'opacity-60', 'opacity-50', 'opacity-50', 'opacity-40'] as const;

interface HeroFloatingCloudsProps {
  variant: HeroCloudVariant;
}

const ANIMATIONS = [
  'float-slow 16s ease-in-out infinite',
  'float-medium 12s ease-in-out infinite',
  'float-fast 8s ease-in-out infinite',
  'float-slow 20s ease-in-out infinite 4s',
  'float-medium 14s ease-in-out infinite 2s',
] as const;

/** Five ambient CSS clouds; parent must be `relative overflow-hidden`. */
export function HeroFloatingClouds({ variant }: HeroFloatingCloudsProps) {
  const o =
    variant === 'home'
      ? HOME_OPACITY
      : variant === 'editorial'
        ? (['opacity-60', 'opacity-60', 'opacity-60', 'opacity-60', 'opacity-60'] as const)
        : (['opacity-30', 'opacity-30', 'opacity-30', 'opacity-30', 'opacity-30'] as const);

  return (
    <>
      <div
        className={`absolute left-[3%] top-[15%] z-0 ${o[0]} pointer-events-none`}
        style={{ animation: ANIMATIONS[0] }}
      >
        <CloudShape size="lg" />
      </div>
      <div
        className={`absolute right-[8%] top-[10%] z-0 ${o[1]} pointer-events-none`}
        style={{ animation: ANIMATIONS[1] }}
      >
        <CloudShape size="md" />
      </div>
      <div
        className={`absolute left-[40%] top-[8%] z-0 ${o[2]} pointer-events-none`}
        style={{ animation: ANIMATIONS[2] }}
      >
        <CloudShape size="sm" />
      </div>
      <div
        className={`absolute bottom-[20%] left-[12%] z-0 ${o[3]} pointer-events-none`}
        style={{ animation: ANIMATIONS[3] }}
      >
        <CloudShape size="md" />
      </div>
      <div
        className={`absolute bottom-[15%] right-[20%] z-0 ${o[4]} pointer-events-none`}
        style={{ animation: ANIMATIONS[4] }}
      >
        <CloudShape size="sm" />
      </div>
    </>
  );
}
