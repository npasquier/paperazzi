'use client';
import {
  Dispatch,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';

// Drop-in `useState` replacement for boolean preferences that should
// survive across sessions. Reads localStorage on mount and writes on every
// change. The signature matches React.Dispatch<SetStateAction<boolean>> so
// existing call sites (`setX(true)`, `setX((v) => !v)`) keep working.
//
// SSR-safe: initial render returns `defaultValue` (no localStorage access
// on the server); a post-mount effect then reads the persisted value and
// updates state if it differs. There's a brief possible flash from default
// → persisted on first paint, which is acceptable for panel state.
//
// Storage failures (private mode, quota exceeded, disabled storage) are
// swallowed — the hook degrades to in-memory state in that case.
export function usePersistedBoolean(
  key: string,
  defaultValue: boolean,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [value, setValue] = useState<boolean>(defaultValue);
  // Track whether we've completed the first localStorage read. Writes
  // before that read could race with the read and clobber the persisted
  // value, so we suppress them until the read completes.
  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      const stored =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(key)
          : null;
      if (stored === 'true' || stored === 'false') {
        setValue(stored === 'true');
      }
    } catch {
      /* localStorage may throw in private mode or with restricted permissions. */
    }
    hydratedRef.current = true;
  }, [key]);

  const setter: Dispatch<SetStateAction<boolean>> = (next) => {
    setValue((prev) => {
      const computed =
        typeof next === 'function'
          ? (next as (p: boolean) => boolean)(prev)
          : next;
      if (hydratedRef.current) {
        try {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, String(computed));
          }
        } catch {
          /* swallow — see hook docstring. */
        }
      }
      return computed;
    });
  };

  return [value, setter];
}
