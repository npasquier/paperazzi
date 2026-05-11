'use client';
import { useEffect, useState } from 'react';
import { X, Database, AlertTriangle, Flag, Download } from 'lucide-react';
import {
  ALL_FIXED_KEYS,
  STORAGE_KEYS,
  STORAGE_KEY_PREFIXES,
  collectionPapersKey,
  collectionGroupsKey,
  isCollectionKey,
  snapshotAllPaperazziStorage,
} from '@/utils/storageKeys';
import {
  buildFullBackupTransfer,
  buildFullBackupTransferFilename,
  serializeFullBackupTransfer,
  PIN_FULL_BACKUP_TRANSFER_MIME,
} from '@/utils/pinCollectionTransfer';

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
interface CollectionSummary {
  id: string;
  name: string;
  pinnedCount: number;
  groupCount: number;
  isActive: boolean;
}

interface StorageData {
  filterPresets: FilterPresetSummary[];
  journalPresets: JournalPresetSummary[];
  collections: CollectionSummary[];
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

interface CollectionsIndexLite {
  activeId: string;
  collections: { id: string; name: string }[];
}

function readStorage(): StorageData {
  if (typeof window === 'undefined') {
    return {
      filterPresets: [],
      journalPresets: [],
      collections: [],
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

  // Pinned papers now live under per-collection keys. Read the index,
  // then sum the counts for each collection. Falls back to the legacy
  // single-bucket key if the migration hasn't run yet (first mount of
  // a tab after upgrade — PinContext runs migration on its own mount).
  const indexRaw = safeParse<CollectionsIndexLite | null>(
    STORAGE_KEYS.collectionsIndex,
    null,
  );
  const collections: CollectionSummary[] = indexRaw
    ? indexRaw.collections.map((c) => {
        const papers = safeParse<unknown[]>(collectionPapersKey(c.id), []);
        const groups = safeParse<unknown[]>(collectionGroupsKey(c.id), []);
        return {
          id: c.id,
          name: c.name,
          pinnedCount: Array.isArray(papers) ? papers.length : 0,
          groupCount: Array.isArray(groups) ? groups.length : 0,
          isActive: c.id === indexRaw.activeId,
        };
      })
    : (() => {
        // Pre-migration view of the data: surface the legacy bucket as
        // a single pseudo-collection so the modal still shows something
        // useful between the version bump and the next PinContext mount.
        const papers = safeParse<unknown[]>(STORAGE_KEYS.pinnedPapers, []);
        const groups = safeParse<unknown[]>(STORAGE_KEYS.pinGroups, []);
        if (
          (Array.isArray(papers) ? papers.length : 0) === 0 &&
          (Array.isArray(groups) ? groups.length : 0) === 0
        ) {
          return [];
        }
        return [
          {
            id: 'legacy',
            name: 'Library',
            pinnedCount: Array.isArray(papers) ? papers.length : 0,
            groupCount: Array.isArray(groups) ? groups.length : 0,
            isActive: true,
          },
        ];
      })();

  return {
    filterPresets: safeParse<FilterPresetSummary[]>(
      STORAGE_KEYS.filterPresets,
      [],
    ),
    journalPresets: safeParse<JournalPresetSummary[]>(
      STORAGE_KEYS.journalPresets,
      [],
    ),
    collections,
    reportedPapers,
    reportedAuthors,
    hasOnboarded:
      localStorage.getItem(STORAGE_KEYS.hasSeenOnboarding) === 'true',
    sidebarWidth: localStorage.getItem(STORAGE_KEYS.pinSidebarWidth),
  };
}

/**
 * Build a `.paperazzi-backup.json` from every Paperazzi-related
 * localStorage entry and trigger a download. Re-importing the file
 * via drag-and-drop wipes-and-restores the same keys, so the user
 * can use this to "save my whole setup, wipe my browser, restore
 * later" without losing pins / saved searches / preferences.
 */
function exportFullBackup(): { ok: true; keyCount: number } | { ok: false } {
  if (typeof window === 'undefined') return { ok: false };
  try {
    const entries = snapshotAllPaperazziStorage();
    const payload = buildFullBackupTransfer(entries);
    const contents = serializeFullBackupTransfer(payload);
    const blob = new Blob([contents], { type: PIN_FULL_BACKUP_TRANSFER_MIME });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildFullBackupTransferFilename();
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
    return { ok: true, keyCount: Object.keys(entries).length };
  } catch (err) {
    console.error('[StorageModal] full-backup export failed', err);
    return { ok: false };
  }
}

function eraseAll() {
  if (typeof window === 'undefined') return;
  for (const k of ALL_FIXED_KEYS) localStorage.removeItem(k);
  // Wildcard keys — sweep:
  //   - `reported-…` (both paper and author flags share the prefix)
  //   - `paperazzi:collection:<id>:papers` and `:groups` (per-collection
  //     pin blobs; we don't know the ids without reading the index, so
  //     a prefix sweep is the simplest path).
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith(STORAGE_KEY_PREFIXES.reportedPaper)) toRemove.push(k);
    else if (isCollectionKey(k)) toRemove.push(k);
  }
  for (const k of toRemove) localStorage.removeItem(k);
  // Reload so contexts (PinContext, FilterPanel) re-hydrate from clean state.
  window.location.reload();
}

export default function StorageModal({ isOpen, onClose }: Props) {
  const [data, setData] = useState<StorageData | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  // Tiny non-blocking flash shown after Export — confirms the file
  // landed in the user's downloads folder without taking over the
  // modal. Auto-clears after 3s.
  const [exportFlash, setExportFlash] = useState<string | null>(null);

  // Re-snapshot localStorage every time the modal opens. Uses the
  // previous-prop-comparison-during-render idiom rather than
  // useEffect+setState — React 19 lints the latter.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setData(readStorage());
      setShowConfirm(false);
      setExportFlash(null);
    }
  }

  useEffect(() => {
    if (!exportFlash) return;
    const t = window.setTimeout(() => setExportFlash(null), 3000);
    return () => window.clearTimeout(t);
  }, [exportFlash]);

  const handleExportFullBackup = () => {
    const result = exportFullBackup();
    if (result.ok) {
      setExportFlash(
        `Backup downloaded — ${result.keyCount} ${
          result.keyCount === 1 ? 'entry' : 'entries'
        } saved.`,
      );
    } else {
      setExportFlash('Export failed — check the console for details.');
    }
  };

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

          {/* Pinned — broken down by collection. */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>
              Pinned papers ({data.collections.length} collection
              {data.collections.length === 1 ? '' : 's'})
            </h4>
            {data.collections.length === 0 ? (
              <p className='text-stone-400'>None</p>
            ) : (
              <ul className='text-stone-600 list-disc pl-4 space-y-0.5'>
                {data.collections.map((c) => (
                  <li key={c.id}>
                    <span className='text-stone-700'>
                      {c.name}
                      {c.isActive && (
                        <span className='text-stone-400'> (active)</span>
                      )}
                    </span>
                    <span className='text-stone-500'>
                      {' '}
                      — {c.pinnedCount} paper{c.pinnedCount === 1 ? '' : 's'}
                      {c.groupCount > 0 &&
                        `, ${c.groupCount} group${c.groupCount === 1 ? '' : 's'}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Contributions to OpenAlex.
              Promoted out of the catch-all "Reported flags & UI
              prefs" section so the thank-you sits in a meaningful
              place: this modal is the single window into "what
              Paperazzi knows about me", and contributions are the
              one set of stored records that produces value beyond
              the user's own session. Empty state is intentionally
              gentle — a nudge, not a guilt trip. */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1 inline-flex items-center gap-1.5'>
              <Flag size={12} className='text-stone-500' />
              Contributions to OpenAlex
            </h4>
            {data.reportedPapers + data.reportedAuthors > 0 ? (
              <div className='banner-info border border-app rounded px-2.5 py-2 text-stone-700'>
                Thank you — you&apos;ve flagged{' '}
                <span className='font-medium text-stone-900'>
                  {[
                    data.reportedPapers > 0 &&
                      `${data.reportedPapers} paper${
                        data.reportedPapers === 1 ? '' : 's'
                      }`,
                    data.reportedAuthors > 0 &&
                      `${data.reportedAuthors} author${
                        data.reportedAuthors === 1 ? '' : 's'
                      }`,
                  ]
                    .filter(Boolean)
                    .join(' and ')}
                </span>{' '}
                for review. Every fix makes OpenAlex better for everyone.
              </div>
            ) : (
              <p className='text-stone-500'>
                You haven&apos;t reported any data errors yet — every fix
                helps.
              </p>
            )}
          </section>

          {/* UI preferences */}
          <section>
            <h4 className='text-stone-700 font-medium mb-1'>
              UI preferences
            </h4>
            <ul className='text-stone-600 space-y-0.5'>
              <li>Onboarding seen: {data.hasOnboarded ? 'yes' : 'no'}</li>
              {data.sidebarWidth && (
                <li>Pin sidebar width: {data.sidebarWidth}px</li>
              )}
            </ul>
          </section>
        </div>

        {/* Tip */}
        <div className='mt-4 p-2.5 surface-muted rounded text-[11px] text-stone-500'>
          To erase individual items or a single section, use the matching
          panel in Paperazzi (Filters, Pinned papers). The button below erases{' '}
          <strong>everything</strong>.
        </div>

        {/* Backup-and-restore. Lives next to "Erase all" because the
            three actions form a natural lifecycle: export → erase →
            restore (drop the file back on the page). The button is
            ghost-styled to keep it visually subordinate to the
            destructive erase action, but the headline copy makes the
            workflow explicit so users know they have a way back. */}
        <div className='mt-3 surface-subtle border border-app rounded p-3'>
          <p className='text-[11px] text-stone-600 leading-snug'>
            <strong className='text-stone-800'>Save your setup.</strong>{' '}
            Download a single file containing every Paperazzi pin, group,
            collection, saved search, and preference. To restore later, drop
            the file back onto any Paperazzi page.
          </p>
          <button
            onClick={handleExportFullBackup}
            className='mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs button-secondary rounded transition'
            title='Download a full snapshot of every Paperazzi-stored item'
          >
            <Download size={12} />
            Export all data
          </button>
          {exportFlash && (
            <p
              role='status'
              aria-live='polite'
              className='mt-2 text-[11px] text-stone-600'
            >
              {exportFlash}
            </p>
          )}
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