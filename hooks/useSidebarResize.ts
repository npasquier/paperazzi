'use client';

// Resizable-sidebar width, extracted from PinSidebar (2026-06 audit,
// L2 decomposition).
//
// The width lives in a tiny module-level external store read via
// useSyncExternalStore (SSR snapshot = default; the persisted value
// appears post-hydration). This is the React-sanctioned replacement
// for the read-localStorage-in-effect pattern, and it lets mousemove
// update the width without touching localStorage — only mouseup
// persists. The drag effect depends only on `isResizing`, so the
// document listeners attach once per gesture instead of once per tick.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { STORAGE_KEYS } from '@/utils/storageKeys';

export const MIN_SIDEBAR_WIDTH = 360;
export const MAX_SIDEBAR_WIDTH = 600;
export const DEFAULT_SIDEBAR_WIDTH = 360;

function clampSidebarWidth(w: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, w));
}

const widthListeners = new Set<() => void>();
/** null = not read yet; first read lazily pulls from localStorage.
 *  Validate + clamp: a corrupted/hand-edited stored value would
 *  otherwise yield NaN or an absurd width and break the layout. */
let sidebarWidthValue: number | null = null;

function readSidebarWidth(): number {
  if (sidebarWidthValue !== null) return sidebarWidthValue;
  let width = DEFAULT_SIDEBAR_WIDTH;
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.pinSidebarWidth);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (Number.isFinite(parsed)) width = clampSidebarWidth(parsed);
    }
  } catch {
    /* private mode etc. — fall back to the default. */
  }
  sidebarWidthValue = width;
  return width;
}

function subscribeSidebarWidth(fn: () => void): () => void {
  widthListeners.add(fn);
  return () => {
    widthListeners.delete(fn);
  };
}

/** Update the in-memory width (during drag). No storage write. */
function setSidebarWidthEphemeral(w: number) {
  sidebarWidthValue = clampSidebarWidth(w);
  for (const fn of [...widthListeners]) fn();
}

/** Persist the current width (on drag end). */
function persistSidebarWidth() {
  try {
    localStorage.setItem(
      STORAGE_KEYS.pinSidebarWidth,
      String(readSidebarWidth()),
    );
  } catch {
    /* swallow — width simply won't survive the session. */
  }
}

/**
 * Width + drag-to-resize behavior for the pin sidebar. The sidebar is
 * anchored to the RIGHT edge of the viewport, so the width during a
 * drag is the distance from the cursor to that edge.
 *
 *   const { width, isResizing, handleResizeStart } = useSidebarResize();
 *   <div style={{ width }}>… <div onMouseDown={handleResizeStart} /> …</div>
 */
export function useSidebarResize() {
  const width = useSyncExternalStore(
    subscribeSidebarWidth,
    readSidebarWidth,
    () => DEFAULT_SIDEBAR_WIDTH,
  );
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Calculate new width (distance from right edge of viewport)
      setSidebarWidthEphemeral(window.innerWidth - e.clientX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      persistSidebarWidth();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    // Prevent text selection while resizing
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return { width, isResizing, handleResizeStart };
}
