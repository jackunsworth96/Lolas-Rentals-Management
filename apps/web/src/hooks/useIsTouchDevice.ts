import { useState, useEffect } from 'react';

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(
      typeof window !== 'undefined' &&
        window.matchMedia('(hover: none) and (pointer: coarse)').matches,
    );
  }, []);
  return isTouch;
}
