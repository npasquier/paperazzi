'use client';

// Outside-click + Escape dismissal for small anchored popovers,
// extracted from PinSidebar (2026-06 audit, L2 decomposition) where the
// same listener dance was duplicated for the collection switcher and
// the export menu. FilterPanel/NavBar popovers can adopt it too.

import { useEffect, useRef } from 'react';

interface Options {
  /**
   * Don't dismiss when the mousedown lands on a `[draggable="true"]`
   * element. Used by the collection switcher: a mousedown on a pinned
   * paper is most likely the start of a drag toward the menu's
   * collection drop targets, so the menu must stay open.
   */
  ignoreDraggables?: boolean;
}

/**
 * Wire a popover to close on outside mousedown or Escape.
 *
 *   const { popoverRef, anchorRef } = useDismissablePopover(open, close);
 *   <button ref={anchorRef} …>  // the toggle button — clicks on it
 *                               // don't count as "outside"
 *   {open && <div ref={popoverRef}>…</div>}
 *
 * `onDismiss` is intentionally a plain callback (not a setState) so the
 * caller can reset any related sub-state (inline inputs etc.) in one
 * place. Keep it referentially stable or accept listener re-attachment
 * per render of the open popover — both are fine at this scale.
 */
export function useDismissablePopover<
  P extends HTMLElement = HTMLDivElement,
  A extends HTMLElement = HTMLButtonElement,
>(open: boolean, onDismiss: () => void, options?: Options) {
  const popoverRef = useRef<P>(null);
  const anchorRef = useRef<A>(null);
  // Keep the latest callback in a ref so the listener effect only
  // re-runs on open/close, not whenever the caller passes a fresh
  // closure. Updated in an effect (not during render) per the React
  // compiler rules — effects run before any user event can fire.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });
  const ignoreDraggables = options?.ignoreDraggables ?? false;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (ignoreDraggables && t?.closest('[draggable="true"]')) return;
      if (
        popoverRef.current &&
        t &&
        !popoverRef.current.contains(t) &&
        anchorRef.current &&
        !anchorRef.current.contains(t)
      ) {
        onDismissRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissRef.current();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ignoreDraggables]);

  return { popoverRef, anchorRef };
}
