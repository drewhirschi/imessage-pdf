'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';

interface SwipeForTimestampsProps {
  children: ReactNode;
  /** Max px the list can slide left to expose timestamps. */
  maxOffset?: number;
}

/**
 * Horizontal-pan wrapper that reveals per-message timestamps on swipe-left,
 * like iMessage's "drag message list left" gesture. Direction-locks on the
 * first move so vertical scrolling stays responsive.
 */
export default function SwipeForTimestamps({
  children,
  maxOffset = 60,
}: SwipeForTimestampsProps) {
  const [offset, setOffset] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const startRef = useRef<{ x: number; y: number; startOffset: number } | null>(null);
  const directionRef = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    // Ignore if interacting with an editable field (inline name editor, etc).
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [contenteditable="true"], button, a')) {
      return;
    }
    startRef.current = { x: e.clientX, y: e.clientY, startOffset: offset };
    directionRef.current = 'undecided';
  }, [offset]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;

    if (directionRef.current === 'undecided') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < 6 && absY < 6) return; // below threshold, keep waiting
      if (absX > absY * 1.2) {
        directionRef.current = 'horizontal';
        setIsPanning(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      } else {
        directionRef.current = 'vertical';
        startRef.current = null; // release — let native scroll happen
        return;
      }
    }

    if (directionRef.current === 'horizontal') {
      const next = Math.min(0, Math.max(-maxOffset, startRef.current.startOffset + dx));
      setOffset(next);
      e.preventDefault();
    }
  }, [maxOffset]);

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (directionRef.current === 'horizontal') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // pointer may already be released
      }
    }
    startRef.current = null;
    directionRef.current = 'undecided';
    setIsPanning(false);
    setOffset(0);
  }, []);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
      onPointerLeave={endPan}
      className="overflow-x-hidden touch-pan-y"
    >
      <div
        style={{
          transform: `translate3d(${offset}px, 0, 0)`,
          transition: isPanning ? 'none' : 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        {children}
      </div>
    </div>
  );
}
