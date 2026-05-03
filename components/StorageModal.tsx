'use client';
import { useEffect, useState } from 'react';
import { X, Database, AlertTriangle } from 'lucide-react';
import {
  ALL_FIXED_KEYS,
  STORAGE_KEYS,
  STORAGE_KEY_PREFIXES,
} from '@/utils/storageKeys';

// ── Shapes we read from localStorage (kept loose; we only show summaries) ──
interface FilterPresetSummary {
  id: string;
  name: string;
  query?: string;
}
interface JournalPresetSummary {
  id: string;
  name: string;
}
interface PinGroupSummary {
  id: string;
  name: string;
  paperIds: string[];
}

interface StorageData {
  filterPresets: FilterPresetSummary[];
  journalPresets: JournalPresetSummary[];
  pinnedCount: number;
  pinGroups: PinGroupSummary[];
  reportedPapers: number;
  reportedAuthors: number;
  hasOnboarded: boolean;
  sidebarWidth: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Fixed keys we know about — sourced from utils/storageKeys.ts so adding a
// new persisted preference there automatically lands in this modal's
// "Erase all" sweep. Wildcard report keys (`reported-author-<id>`,
// `reported-<workId>`) are handled by prefix matching, see eraseAll().

function safeParse<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readStorage(): StorageData {
  if (typeof window === 'undefined') {
    return {
      filterPresets: [],
      journalPresets: [],
      pinnedCount: 0,
      pinGroups: [],
      reportedPapers: 0,
      reportedAuthors: 0,
      hasOnboarded: false,
      sidebarWidth: null,
    };
  }

  let reportedPapers = 0;
  let reportedAuthors = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    // Order matters: `reported-author-<id>` is a stricter prefix of
    // `reported-<workId>`, so check the author key first.
    if (k.startsWith(STORAGE_KEY_PREFIXES.reportedAuthor)) reportedAuthors++;
    else if (k.startsWith(STORAGE_KEY_PREFIXES.reportedPaper))
      reportedPapers++;
  }

  const pinnedRaw = safeParse<unknown[]>(STORAGE_KEYS.pinnedPapers, []);

  return {
    filterPresets: safeParse<FilterPresetSummary[]>(
      STORAGE_KEYS.filterPresets,
      [],
    ),
    journalPresets: safeParse<JournalPresetSummary[]>(
      STORAGE_KEYS.journalPresets,
      [],
    ),
    pinnedCount: Array.isArray(pinnedRaw) ? pinnedRaw.length : 0,
    pinGroups: safeParse<PinGroupSummary[]>(STORAGE_KEYS.pinGroups, []),
    reportedPapers,
    reportedAuthors,
    hasOnboarded:
      localStorage.getItem(STORAGE_KEYS.hasSeenOnboarding) === 'true',
    sidebarWidth: localStorage.getItem(STORAGE_KEYS.pinSidebarWidth),
  };
}

function eraseAll() {
  if (typeof window === 'undefined') return;
  for (const k of ALL_FIXED_KEYS) localStorage.removeItem(k);
  // Wildcard keys — both `reported-author-<id>` and `reported-<workId>`
  // share the `reported-` prefix, so a single check sweeps them both.
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(STORAGE_KEY_PREFIXES.reportedPaper)) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) localStorage.removeItem(k);
  // Reload so contexts (PinContext, FilterPanel) re-hydrate from clean state.
  window.location.reload();
}

export default function StorageModal({ isOpen, onClose }: Props) {
  const [data, setData] = useState<StorageData | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setData(readStorage());
      setShowConfirm(false);
    }
  }, [isOpen]);

  if (!isOpen || !data) return null;

  return (
    <div
      className='fixed inset-0 overlay-soft flex items-center justify-center z-50'
      onClick={onClose}
    >
      <div
        className='surface-card rounded-lg border border-app p-5 max-w-lg w-full mx-4 shadow-lg max-h-[80vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between mb-4'>
          <div className='flex items-center gap-2'>
            <Database size={16} className='text-stone-500' />
            <h3 className='text-sm font-medium text-stone-900'>Stored data</h3>
          </div>
          <button
            onClick={onClose}
            className='text-stone-400 hover:text-stone-600 transition'
            aria-label='Close'
          >
            <X size={18} />
          </button>
        </div>

        {/* Categories */}
        <div className='space-y-3 text-xs'>
          {/* Saved searches */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>
              Saved searches ({data.filterPresets.length})
            </h4>
            {data.filterPresets.length === 0 ? (
              <p className='text-stone-400'>None</p>
            ) : (
              <ul className='text-stone-600 list-disc pl-4 space-y-0.5'>
                {data.filterPresets.map((p) => (
                  <li key={p.id}>
                    <span className='text-stone-700'>{p.name}</span>
                    {p.query ? (
                      <span className='text-stone-400'>
                        {' '}
                        — &quot;{p.query.slice(0, 40)}
                        {p.query.length > 40 ? '…' : ''}&quot;
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Saved journal filters */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>
              Saved journal filters ({data.journalPresets.length})
            </h4>
            {data.journalPresets.length === 0 ? (
              <p className='text-stone-400'>None</p>
            ) : (
              <ul className='text-stone-600 list-disc pl-4 space-y-0.5'>
                {data.journalPresets.map((p) => (
                  <li key={p.id}>
                    <span className='text-stone-700'>{p.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pinned */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>Pinned papers</h4>
            <p className='text-stone-600'>
              {data.pinnedCount} paper{data.pinnedCount === 1 ? '' : 's'}
              {data.pinGroups.length > 0 &&
                ` · ${data.pinGroups.length} group${
                  data.pinGroups.length === 1 ? '' : 's'
                }`}
            </p>
          </section>

          {/* Reported flags + UI prefs */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>
              Reported flags &amp; UI preferences
            </h4>
            <ul className='text-stone-600 space-y-0.5'>
              <li>
                {data.reportedPapers} reported paper
                {data.reportedPapers === 1 ? '' : 's'}
              </li>
              <li>
                {data.reportedAuthors} reported author
                {data.reportedAuthors === 1 ? '' : 's'}
              </li>
              <li>Onboarding seen: {data.hasOnboarded ? 'yes' : 'no'}</li>
              {data.sidebarWidth && (
                <li>Pin sidebar width: {data.sidebarWidth}px</li>
              )}
            </ul>
          </section>
        </div>

        {/* Tip */}
        <div className='mt-4 p-2.5 surface-muted rounded text-[11px] text-stone-500'>
          To erase individual items or a single category, use the matching
          panel in Paperazzi (Filters, Pinned papers). The button below erases{' '}
          <strong>everything</strong>.
        </div>

        {/* Erase all */}
        <div className='mt-3'>
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className='w-full px-3 py-2 text-xs button-danger-soft rounded transition'
            >
              Erase all stored data
            </button>
          ) : (
            <div className='space-y-2'>
              <div className='flex items-start gap-2 p-2.5 banner-danger rounded'>
                <AlertTriangle
                  size={14}
                  className='text-danger flex-shrink-0 mt-0.5'
                />
                <p className='text-[11px] text-danger'>
                  This permanently erases all saved searches, journal filters,
                  pinned papers, groups, reported flags, and UI preferences.
                  The page will reload afterwards.
                </p>
              </div>
              <div className='flex gap-2'>
                <button
                  onClick={() => setShowConfirm(false)}
                  className='flex-1 px-3 py-2 text-xs button-ghost rounded transition'
                >
                  Cancel
                </button>
                <button
                  onClick={eraseAll}
                  className='flex-1 px-3 py-2 text-xs button-danger rounded transition'
                >
                  Confirm erase
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
