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
        // Width bumped from max-w-lg → max-w-xl so the 2-column data
        // grid below has room to breathe without forcing the modal to
        // grow vertically. Padding tightened to p-4 to claw back some
        // height. overflow-y-auto stays as a safety net for users
        // with many saved presets / collections, but in the common
        // case the body fits in viewport without a scrollbar.
        className='surface-card rounded-lg border border-app p-4 max-w-xl w-full mx-4 shadow-lg max-h-[85vh] overflow-y-auto'
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className='flex items-center justify-between mb-3'>
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

        {/* Reading order, top to bottom:
              1. Contributions banner — the value-extending section
                 sets the tone for the rest of the modal.
              2. "Stored on this device" — the modal's actual subject,
                 grouped under one quiet sub-header so the four data
                 buckets read as a list, not five same-weight headings.
              3. "Manage" — backup + erase actions grouped together
                 with the erase tip moved next to the erase button
                 (granular-alternative messaging right at the point of
                 decision). */}

        {/* 1) Contributions to OpenAlex — banner CTA at the top.
               Spacing tightened (space-y-1.5, mb-4, p-2.5) so the
               banner stays prominent without dominating the modal's
               vertical budget. Empty-state copy trimmed to the
               essential pitch — Paperazzi-does-the-paperwork framing
               is preserved. */}
        <section className='banner-info border border-app rounded-lg p-2.5 space-y-1.5 text-xs mb-4'>
          <h4 className='text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5'>
            <Flag size={14} className='text-accent-strong' />
            Contributions to OpenAlex
          </h4>
          <p className='text-stone-700 leading-snug'>
            Paperazzi reads from{' '}
            <a
              href='https://openalex.org/'
              target='_blank'
              rel='noopener noreferrer'
              className='underline underline-offset-2 hover:text-stone-900'
            >
              OpenAlex
            </a>{' '}
            — an open, non-profit catalog of scholarly works. It&apos;s only
            as good as the corrections people send in.
          </p>
          {data.reportedPapers + data.reportedAuthors > 0 ? (
            <p className='text-stone-700 leading-snug'>
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
              for review. Every fix makes OpenAlex better for everyone — keep
              going.
            </p>
          ) : (
            <p className='text-stone-700 leading-snug'>
              Spot a wrong author, title, or missing PDF? Click the{' '}
              <Flag
                size={11}
                className='inline align-text-bottom text-accent-strong mx-0.5'
                aria-hidden='true'
              />{' '}
              flag on any paper card — Paperazzi pre-fills the{' '}
              <strong className='font-medium text-stone-900'>
                OpenAlex ID
              </strong>{' '}
              and links the right correction form. Two minutes for you, a fix
              for the next researcher who finds that paper.
            </p>
          )}
        </section>

        {/* 2) Stored on this device — the four local-storage buckets,
               laid out as a 2×2 grid so the modal stays within
               viewport without forcing a scrollbar. The buckets are
               of comparable visual weight and don't depend on each
               other, so the grid reads as well as the stacked list
               and halves the vertical real estate. */}
        <div className='mb-4'>
          <h3 className='text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-1.5'>
            Stored on this device
          </h3>
          <div className='grid grid-cols-2 gap-x-4 gap-y-3 text-xs'>
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
                        — {c.pinnedCount} paper
                        {c.pinnedCount === 1 ? '' : 's'}
                        {c.groupCount > 0 &&
                          `, ${c.groupCount} group${c.groupCount === 1 ? '' : 's'}`}
                      </span>
                    </li>
                  ))}
                </ul>
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
        </div>

        {/* 3) Manage — backup + erase grouped under one eyebrow
               header. Export → erase form a natural lifecycle, so we
               keep them adjacent. The granular-alternative tip used to
               sit before the Backup card; it has been moved next to
               the Erase button where it actually matters (point of
               decision). */}
        <div>
          <h3 className='text-[11px] uppercase tracking-wider text-stone-500 font-medium mb-1.5'>
            Manage
          </h3>

          {/* Backup card */}
          <div className='surface-subtle border border-app rounded p-2.5'>
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

          {/* Erase — tip + nuclear button. The tip lives here (rather
              than above the Backup card) so the granular alternative
              is surfaced at the exact moment the user is reaching for
              the destructive action. */}
          <div className='mt-3'>
            <p className='text-[11px] text-stone-500 leading-snug mb-2'>
              To erase individual items or a single section, use the matching
              panel in Paperazzi (Filters, Pinned papers). The button below
              erases <strong>everything</strong>.
            </p>
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
                    This permanently erases all saved searches, journal
                    filters, pinned papers, groups, reported flags, and UI
                    preferences. The page will reload afterwards.
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
    </div>
  );
}