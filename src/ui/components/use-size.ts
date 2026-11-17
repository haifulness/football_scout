import { useCallback, useRef, useState } from 'react';

/**
 * Tracks an element's content size (for responsive SVG like the world map).
 * Uses a callback ref so it works even when the element mounts after a loading state.
 */
export function useSize<T extends HTMLElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    ro.observe(el);
    observer.current = ro;
  }, []);
  return [ref, size] as const;
}
