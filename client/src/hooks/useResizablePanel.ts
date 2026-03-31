import { useState, useEffect, useCallback, useRef } from 'react';

interface UseResizablePanelOptions {
  containerRef: React.RefObject<HTMLElement | null>;
  defaultSize: number;
  minSize: number;
  maxSize: number;
  /** Which side the panel is measured from. 'left' = offset from left edge, 'right' = offset from right edge */
  direction?: 'left' | 'right';
  /** 'px' measures in pixels; '%' measures as percentage of container width */
  unit?: 'px' | '%';
  /** localStorage key for persisting the size across page loads */
  storageKey?: string;
}

interface UseResizablePanelResult {
  size: number;
  isDragging: boolean;
  handleMouseDown: (e: React.MouseEvent) => void;
}

function loadFromStorage(key: string, defaultSize: number): number {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      const parsed = parseFloat(stored);
      if (!isNaN(parsed)) return parsed;
    }
  } catch {
    // localStorage may be unavailable
  }
  return defaultSize;
}

function saveToStorage(key: string, size: number): void {
  try {
    localStorage.setItem(key, String(size));
  } catch {
    // ignore
  }
}

export function useResizablePanel({
  containerRef,
  defaultSize,
  minSize,
  maxSize,
  direction = 'left',
  unit = 'px',
  storageKey,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [size, setSize] = useState(() =>
    storageKey ? loadFromStorage(storageKey, defaultSize) : defaultSize
  );
  const [isDragging, setIsDragging] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      let newSize: number;

      if (unit === '%') {
        const offset = direction === 'right'
          ? rect.right - e.clientX
          : e.clientX - rect.left;
        newSize = Math.min(Math.max((offset / rect.width) * 100, minSize), maxSize);
      } else {
        const offset = direction === 'right'
          ? rect.right - e.clientX
          : e.clientX - rect.left;
        newSize = Math.min(Math.max(offset, minSize), maxSize);
      }

      setSize(newSize);
      if (storageKey) saveToStorage(storageKey, newSize);
    };

    const onMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, containerRef, direction, unit, minSize, maxSize, storageKey]);

  return { size, isDragging, handleMouseDown };
}
