'use client';

// Curation dashboard — triage flow with reversible pins.
//
// 1. Scan LISTS OpenAlex works that have a DOI but no abstract (fast, no
//    recovery). Nothing is hidden or deleted — you get every candidate.
// 2. Triage: pin rows that aren't real abstract gaps as "not an article".
//    Pins are reversible (unpin anytime) and persist across scans. A title
//    heuristic auto-pins likely non-articles (Front Matter, auditor reports,
//    Nobel lectures) as a starting point; unpin any it gets wrong. A filter
//    toggle hides/shows pinned rows.
// 3. Recover abstracts for the genuine gaps (per-row or in bulk) via
//    /api/recover-abstract, then Submit correction (copies the abstract,
//    opens OpenAlex's form). "Report other" opens the form for a non-abstract
//    fix (e.g. reclassifying front matter). Nothing is submitted automatically.
//
// Fully client-driven and stateless. Results, pins and unpins live in
// localStorage (no database), matching the rest of Paperazzi.

import { useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import {
  ExternalLink,
  Loader2,
  Search,
  Square,
  Pin,
  PinOff,
  Flag,
  RefreshCw,
  Trash2,
  CheckCircle,
} from 'lucide-react';
import { useActiveRanking } from '@/utils/activeRanking';
import { withMailto } from '@/utils/openAlexClient';
import { normalizeId } from '@/utils/normalizeId';
import { reportedPaperKey } from '@/utils/storageKeys';
import { emit } from '@/utils/eventBus';
import {
  openCorrectionForm,
  copyWorkIdAndOpenCorrectionForm,
} from '@/utils/correctionForms';

type RowStatus = 'idle' | 'recovering' | 'recovered' | 'none' | 'error';

interface ScanRow {
  workId: string;
  doi: string;
  title: string;
  year: number | null;
  selected: boolean;
  status: RowStatus;
  abstract?: string;
  source?: string;
}

interface JournalOption {
  value: string; // ISSN
  label: string;
}

const STORAGE_KEY = 'paperazzi-curate-v1';
const PINS_KEY = 'paperazzi-curate-pins-v1'; // explicitly pinned work ids
const UNPINS_KEY = 'paperazzi-curate-unpins-v1'; // heuristic matches the user rejected
const CURRENT_YEAR = new Date().getFullYear();

interface RawListWork {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number | null;
  abstract_inverted_index: Record<string, number[]> | null;
}

/**
 * Heuristic flag for titles that are almost certainly NOT research articles
 * (so legitimately have no abstract). Used to AUTO-PIN as a starting point —
 * always reversible by unpinning.
 */
function looksLikeNonArticle(title: string): boolean {
  return /(^|\b)(front|back)\s*matter\b|report of independent auditor|editorial board|table of contents|^\s*index\s*$|masthead|in this issue|a special introduction|acknowledg.* of referees|list of referees|nobel lecture|^\s*errata?\s*$/i.test(
    title,
  );
}

export default function CurateDashboard() {
  const ranking = useActiveRanking();

  const [journal, setJournal] = useState<JournalOption | null>(null);
  const [fromYear, setFromYear] = useState(2015);
  const [toYear, setToYear] = useState(CURRENT_YEAR);
  const [maxCandidates, setMaxCandidates] = useState(100);

  const [rows, setRows] = useState<ScanRow[]>([]);
  const [pins, setPins] = useState<Record<string, true>>({});
  const [unpins, setUnpins] = useState<Record<string, true>>({});
  // "Reported" flags, shared with the rest of the app via the same
  // reportedPaperKey localStorage entries the paper cards use, so a paper
  // reported here also shows as reported in search results.
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [hidePinned, setHidePinned] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  // One-time hydration from localStorage.
  useEffect(() => {
    try {
      /* eslint-disable react-hooks/set-state-in-effect */
      const p = localStorage.getItem(PINS_KEY);
      if (p) setPins(JSON.parse(p));
      const u = localStorage.getItem(UNPINS_KEY);
      if (u) setUnpins(JSON.parse(u));

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          rows?: ScanRow[];
          journal?: JournalOption | null;
          fromYear?: number;
          toYear?: number;
          maxCandidates?: number;
          hidePinned?: boolean;
        };
        if (saved.rows) setRows(saved.rows);
        if (saved.journal) setJournal(saved.journal);
        if (typeof saved.fromYear === 'number') setFromYear(saved.fromYear);
        if (typeof saved.toYear === 'number') setToYear(saved.toYear);
        if (typeof saved.maxCandidates === 'number')
          setMaxCandidates(saved.maxCandidates);
        if (typeof saved.hidePinned === 'boolean') setHidePinned(saved.hidePinned);
      }
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      /* corrupt/empty — ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ rows, journal, fromYear, toYear, maxCandidates, hidePinned }),
      );
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [rows, journal, fromYear, toYear, maxCandidates, hidePinned]);

  // Hydrate the per-row "reported" flags from the shared reportedPaperKey
  // entries whenever the row set changes (e.g. after a scan or reload).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const next: Record<string, boolean> = {};
    for (const r of rows) {
      const id = normalizeId(r.workId);
      try {
        if (localStorage.getItem(reportedPaperKey(id)) === 'true') {
          next[id] = true;
        }
      } catch {
        /* non-fatal */
      }
    }
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setReported(next);
  }, [rows]);

  function persist(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* non-fatal */
    }
  }

  /** A row is pinned if explicitly pinned, or a heuristic match the user
   *  hasn't explicitly unpinned. */
  function isPinned(workId: string, title: string): boolean {
    if (pins[workId]) return true;
    if (unpins[workId]) return false;
    return looksLikeNonArticle(title);
  }

  function setPin(workId: string, pinned: boolean) {
    const nextPins = { ...pins };
    const nextUnpins = { ...unpins };
    if (pinned) {
      nextPins[workId] = true;
      delete nextUnpins[workId];
    } else {
      delete nextPins[workId];
      nextUnpins[workId] = true; // remember the rejection so auto-pin won't redo it
    }
    setPins(nextPins);
    setUnpins(nextUnpins);
    persist(PINS_KEY, nextPins);
    persist(UNPINS_KEY, nextUnpins);
  }

  const isReported = (workId: string): boolean =>
    !!reported[normalizeId(workId)];

  function toggleReported(workId: string) {
    const id = normalizeId(workId);
    const key = reportedPaperKey(id);
    const next = { ...reported };
    if (next[id]) {
      delete next[id];
      try {
        localStorage.removeItem(key);
      } catch {
        /* non-fatal */
      }
    } else {
      next[id] = true;
      try {
        localStorage.setItem(key, 'true');
      } catch {
        /* non-fatal */
      }
      emit('paper-reported', { paperId: id });
    }
    setReported(next);
  }

  const journalOptions: JournalOption[] = (ranking?.journals ?? [])
    .filter((j) => j.issn)
    .map((j) => ({ value: j.issn, label: `${j.name} (${j.issn})` }));

  // ── Phase 1: list candidates (no recovery) ───────────────────────────────
  async function scan() {
    if (scanning || recovering || !journal) return;
    setError(null);
    stopRef.current = false;
    setScanning(true);
    setRows([]);
    setProgress({ done: 0, total: 0 });
    try {
      const candidates = await listMissingAbstracts(
        journal.value,
        fromYear,
        toYear,
        maxCandidates,
        () => stopRef.current,
      );
      setRows(
        candidates.map((c) => ({ ...c, selected: false, status: 'idle' })),
      );
    } catch (e) {
      setError((e as Error).message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  // ── Phase 2: recover abstracts ────────────────────────────────────────────
  async function recoverRow(workId: string) {
    const row = rows.find((r) => r.workId === workId);
    if (!row) return;
    setRowsBy(workId, (r) => ({ ...r, status: 'recovering' }));
    try {
      const res = await fetch(
        `/api/recover-abstract?doi=${encodeURIComponent(row.doi)}`,
      );
      const data = (await res.json()) as {
        found?: boolean;
        abstract?: string;
        source?: string;
      };
      setRowsBy(workId, (r) =>
        data.found && data.abstract
          ? { ...r, status: 'recovered', abstract: data.abstract, source: data.source }
          : // clear any stale abstract (e.g. an old Semantic Scholar result)
            { ...r, status: 'none', abstract: undefined, source: undefined },
      );
    } catch {
      setRowsBy(workId, (r) => ({ ...r, status: 'error' }));
    }
  }

  // Re-fetch a set of rows sequentially. Used by both "Recover selected" and
  // "Re-fetch all" — it re-runs recovery regardless of a row's current status,
  // so a stale/wrong abstract (e.g. an old Semantic Scholar result) gets
  // overwritten with a fresh Crossref / landing-page lookup.
  async function recoverMany(targets: ScanRow[]) {
    if (recovering || targets.length === 0) return;
    stopRef.current = false;
    setRecovering(true);
    setProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break;
      await recoverRow(targets[i].workId);
      setProgress({ done: i + 1, total: targets.length });
    }
    setRecovering(false);
  }
  function recoverSelected() {
    return recoverMany(rows.filter((r) => r.selected && r.status !== 'recovering'));
  }
  function recoverAll() {
    return recoverMany(rows.filter((r) => r.status !== 'recovering'));
  }
  function clearResults() {
    setRows([]);
    setProgress({ done: 0, total: 0 });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* non-fatal */
    }
  }

  // ── Row helpers ───────────────────────────────────────────────────────────
  function setRowsBy(workId: string, fn: (r: ScanRow) => ScanRow) {
    setRows((prev) => prev.map((r) => (r.workId === workId ? fn(r) : r)));
  }
  function toggleSelect(workId: string) {
    setRowsBy(workId, (r) => ({ ...r, selected: !r.selected }));
  }
  function selectAllVisible(on: boolean) {
    setRows((prev) =>
      prev.map((r) =>
        hidePinned && isPinned(r.workId, r.title)
          ? r
          : { ...r, selected: on },
      ),
    );
  }
  function pinSelected(pinned: boolean) {
    const nextPins = { ...pins };
    const nextUnpins = { ...unpins };
    for (const r of rows) {
      if (!r.selected) continue;
      if (pinned) {
        nextPins[r.workId] = true;
        delete nextUnpins[r.workId];
      } else {
        delete nextPins[r.workId];
        nextUnpins[r.workId] = true;
      }
    }
    setPins(nextPins);
    setUnpins(nextUnpins);
    persist(PINS_KEY, nextPins);
    persist(UNPINS_KEY, nextUnpins);
  }

  const visibleRows = hidePinned
    ? rows.filter((r) => !isPinned(r.workId, r.title))
    : rows;
  const pinnedCount = rows.filter((r) => isPinned(r.workId, r.title)).length;
  const selectedCount = rows.filter((r) => r.selected).length;
  const recoveredCount = rows.filter((r) => r.status === 'recovered').length;
  const busy = scanning || recovering;

  return (
    <div className='space-y-6'>
      <header>
        <h1 className='text-2xl font-semibold text-[var(--foreground)]'>
          Abstract curation
        </h1>
        <p className='mt-1 text-sm text-[var(--muted-foreground,#666)]'>
          Find papers with a DOI but no abstract in OpenAlex. Pin the ones that
          aren&rsquo;t real articles (reversibly), recover abstracts for the
          genuine gaps, and submit them to OpenAlex&rsquo;s correction form.
          Nothing is submitted automatically.
        </p>
      </header>

      {/* Controls */}
      <div className='flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border,#e5e5e5)] p-4'>
        <label className='flex-1 min-w-[260px] text-sm'>
          <span className='mb-1 block font-medium'>Journal</span>
          <Select<JournalOption>
            options={journalOptions}
            value={journal}
            onChange={(v) => setJournal(v)}
            placeholder='Choose a journal…'
            isClearable
            isDisabled={busy}
            classNamePrefix='rs'
          />
        </label>
        <label className='text-sm'>
          <span className='mb-1 block font-medium'>From</span>
          <input
            type='number'
            value={fromYear}
            min={1900}
            max={toYear}
            disabled={busy}
            onChange={(e) => setFromYear(Number(e.target.value))}
            className='w-24 rounded border border-[var(--border,#ccc)] px-2 py-1.5'
          />
        </label>
        <label className='text-sm'>
          <span className='mb-1 block font-medium'>To</span>
          <input
            type='number'
            value={toYear}
            min={fromYear}
            max={CURRENT_YEAR}
            disabled={busy}
            onChange={(e) => setToYear(Number(e.target.value))}
            className='w-24 rounded border border-[var(--border,#ccc)] px-2 py-1.5'
          />
        </label>
        <label className='text-sm'>
          <span className='mb-1 block font-medium'>Max papers</span>
          <input
            type='number'
            value={maxCandidates}
            min={1}
            max={500}
            disabled={busy}
            onChange={(e) => setMaxCandidates(Number(e.target.value))}
            className='w-24 rounded border border-[var(--border,#ccc)] px-2 py-1.5'
          />
        </label>

        {busy ? (
          <button
            onClick={() => (stopRef.current = true)}
            className='inline-flex items-center gap-2 rounded bg-[var(--destructive,#b91c1c)] px-4 py-2 text-sm font-medium text-white'
          >
            <Square size={15} /> Stop
          </button>
        ) : (
          <button
            onClick={scan}
            disabled={!journal}
            className='inline-flex items-center gap-2 rounded bg-[var(--primary,#2563eb)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50'
          >
            <Search size={15} /> Scan
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {rows.length > 0 && (
        <div className='flex flex-wrap items-center gap-3 text-sm'>
          <button
            onClick={() => selectAllVisible(true)}
            disabled={busy}
            className='rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            Select all
          </button>
          <button
            onClick={() => selectAllVisible(false)}
            disabled={busy}
            className='rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            Clear selection
          </button>
          <button
            onClick={() => pinSelected(true)}
            disabled={busy || selectedCount === 0}
            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            <Pin size={13} /> Pin selected
          </button>
          <button
            onClick={() => pinSelected(false)}
            disabled={busy || selectedCount === 0}
            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            <PinOff size={13} /> Unpin selected
          </button>
          <button
            onClick={recoverSelected}
            disabled={busy || selectedCount === 0}
            className='inline-flex items-center gap-2 rounded bg-[var(--primary,#2563eb)] px-3 py-1 font-medium text-white disabled:opacity-50'
          >
            {recovering ? (
              <Loader2 size={14} className='animate-spin' />
            ) : (
              <RefreshCw size={14} />
            )}
            Recover selected ({selectedCount})
          </button>
          <button
            onClick={recoverAll}
            disabled={busy || rows.length === 0}
            title='Re-fetch every listed paper (overwrites stale abstracts)'
            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            <RefreshCw size={13} /> Re-fetch all
          </button>
          <button
            onClick={clearResults}
            disabled={busy}
            title='Clear the results table and stored data'
            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-[var(--muted-foreground,#666)] hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            <Trash2 size={13} /> Clear results
          </button>

          <label className='ml-auto inline-flex items-center gap-1.5'>
            <input
              type='checkbox'
              checked={hidePinned}
              onChange={(e) => setHidePinned(e.target.checked)}
            />
            Hide &ldquo;not an article&rdquo; ({pinnedCount})
          </label>
          <span className='text-[var(--muted-foreground,#666)]'>
            {recovering
              ? `Recovering… ${progress.done}/${progress.total}`
              : `${visibleRows.length} shown · ${recoveredCount} recovered`}
          </span>
        </div>
      )}

      {error && (
        <p className='rounded border border-[var(--destructive,#b91c1c)] bg-red-50 px-3 py-2 text-sm text-[var(--destructive,#b91c1c)]'>
          {error}
        </p>
      )}

      {scanning && (
        <div className='flex items-center gap-2 text-sm text-[var(--muted-foreground,#666)]'>
          <Loader2 size={15} className='animate-spin' />
          Finding papers without abstracts…
        </div>
      )}

      {/* Results table */}
      {visibleRows.length > 0 && (
        <div className='overflow-x-auto rounded-lg border border-[var(--border,#e5e5e5)]'>
          <table className='w-full text-left text-sm'>
            <thead className='border-b border-[var(--border,#e5e5e5)] bg-[var(--muted,#f7f7f7)]'>
              <tr>
                <th className='px-3 py-2 w-8'></th>
                <th className='px-3 py-2 font-medium'>Info</th>
                <th className='px-3 py-2 font-medium'>Title</th>
                <th className='px-3 py-2 font-medium'>Year</th>
                <th className='px-3 py-2 font-medium'>Abstract</th>
                <th className='px-3 py-2 font-medium'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const pinned = isPinned(r.workId, r.title);
                return (
                  <tr
                    key={r.workId}
                    className={
                      'border-b border-[var(--border,#f0f0f0)] align-top' +
                      (pinned ? ' opacity-60' : '')
                    }
                  >
                    <td className='px-3 py-2'>
                      <input
                        type='checkbox'
                        checked={r.selected}
                        disabled={busy}
                        onChange={() => toggleSelect(r.workId)}
                      />
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      <div className='flex flex-col items-start gap-1'>
                        <a
                          href={`https://doi.org/${r.doi}`}
                          target='_blank'
                          rel='noopener noreferrer'
                          title='Open the paper at its DOI to check the abstract'
                          className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                        >
                          <ExternalLink size={12} /> DOI
                        </a>
                        <code
                          title='OpenAlex Work ID'
                          className='font-mono text-[10px] text-[var(--muted-foreground,#999)]'
                        >
                          {normalizeId(r.workId)}
                        </code>
                      </div>
                    </td>
                    <td className='px-3 py-2'>
                      {r.title}
                      {pinned && (
                        <span className='ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800'>
                          not an article
                        </span>
                      )}
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      {r.year ?? '—'}
                    </td>
                    <td className='px-3 py-2 max-w-[380px]'>
                      {r.status === 'idle' && (
                        <span className='text-[var(--muted-foreground,#999)]'>
                          not recovered
                        </span>
                      )}
                      {r.status === 'recovering' && (
                        <Loader2 size={14} className='animate-spin' />
                      )}
                      {r.status === 'recovered' && (
                        <>
                          <span className='mr-2 rounded bg-[var(--muted,#eef)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide'>
                            {r.source}
                          </span>
                          {r.abstract!.length > 220
                            ? r.abstract!.slice(0, 220) + ' …'
                            : r.abstract}
                        </>
                      )}
                      {r.status === 'none' && (
                        <span className='text-[var(--muted-foreground,#999)]'>
                          no abstract found
                        </span>
                      )}
                      {r.status === 'error' && (
                        <span className='text-[var(--destructive,#b91c1c)]'>
                          error
                        </span>
                      )}
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      <div className='flex flex-wrap gap-1'>
                        {r.status !== 'recovering' && (
                          <button
                            onClick={() => recoverRow(r.workId)}
                            disabled={busy}
                            title={
                              r.status === 'idle'
                                ? 'Try to recover this abstract now'
                                : 'Re-fetch — try the sources again'
                            }
                            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
                          >
                            <RefreshCw size={12} />{' '}
                            {r.status === 'idle' || r.status === 'error'
                              ? 'Recover'
                              : 'Re-fetch'}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            openCorrectionForm(r.workId, 'abstract', {
                              abstract: r.abstract,
                            })
                          }
                          title={
                            r.abstract
                              ? 'Copy abstract to clipboard and open the OpenAlex correction form'
                              : 'Open the OpenAlex abstract-correction form — no abstract recovered, paste it manually after checking the DOI'
                          }
                          className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                        >
                          <ExternalLink size={12} /> Submit correction
                        </button>
                        <button
                          onClick={() => setPin(r.workId, !pinned)}
                          title={
                            pinned
                              ? 'Unpin — treat as a real article again'
                              : 'Pin as "not an article"'
                          }
                          className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                        >
                          {pinned ? <PinOff size={12} /> : <Pin size={12} />}
                          {pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button
                          onClick={() => copyWorkIdAndOpenCorrectionForm(r.workId)}
                          title='Open the OpenAlex form for a non-abstract fix (e.g. reclassify front matter). Copies the Work ID.'
                          className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                        >
                          <Flag size={12} /> Report other
                        </button>
                        <button
                          onClick={() => toggleReported(r.workId)}
                          title={
                            isReported(r.workId)
                              ? 'Unmark as reported'
                              : 'Mark as reported'
                          }
                          className={
                            'inline-flex items-center gap-1 rounded border px-2 py-1 text-xs ' +
                            (isReported(r.workId)
                              ? 'border-green-600 text-green-700'
                              : 'border-[var(--border,#ccc)] hover:bg-[var(--muted,#f3f3f3)]')
                          }
                        >
                          <CheckCircle size={12} />
                          {isReported(r.workId) ? 'Reported' : 'Mark as reported'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && visibleRows.length === 0 && (
        <p className='text-sm text-[var(--muted-foreground,#888)]'>
          All {rows.length} listed papers are pinned as &ldquo;not an
          article&rdquo;. Untick the filter above to see them.
        </p>
      )}
    </div>
  );
}

// ── OpenAlex listing (browser-side; OpenAlex sends permissive CORS) ─────────

/**
 * Page through one journal's DOI-bearing articles that OpenAlex marks as
 * having no abstract, up to `cap`. Filters out paratext server-side,
 * double-checks the inverted index is null client-side, and retries without
 * the has_abstract filter if OpenAlex rejects it. Returns every candidate —
 * pinning/hiding is a view concern handled in the component.
 */
async function listMissingAbstracts(
  issn: string,
  fromYear: number,
  toYear: number,
  cap: number,
  shouldStop: () => boolean,
): Promise<Array<Pick<ScanRow, 'workId' | 'doi' | 'title' | 'year'>>> {
  const select = 'id,doi,title,publication_year,abstract_inverted_index';
  const base =
    `primary_location.source.issn:${issn},has_doi:true,` +
    `type:article,is_paratext:false,` +
    `from_publication_date:${fromYear}-01-01,to_publication_date:${toYear}-12-31`;

  const out: Array<Pick<ScanRow, 'workId' | 'doi' | 'title' | 'year'>> = [];
  let useAbstractFilter = true;
  let cursor = '*';

  while (out.length < cap && cursor && !shouldStop()) {
    const filter = useAbstractFilter ? `${base},has_abstract:false` : base;
    const url = withMailto(
      `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}` +
        `&select=${select}&per-page=200&cursor=${encodeURIComponent(cursor)}`,
    );

    let page: { results: RawListWork[]; meta: { next_cursor: string | null } };
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
      page = (await res.json()) as typeof page;
    } catch (err) {
      if (useAbstractFilter) {
        useAbstractFilter = false; // filter rejected → client-side null check
        cursor = '*';
        continue;
      }
      throw err;
    }

    for (const w of page.results) {
      if (w.abstract_inverted_index != null || !w.doi) continue;
      out.push({
        workId: normalizeId(w.id),
        doi: w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ''),
        title: w.title ?? '(untitled)',
        year: w.publication_year,
      });
      if (out.length >= cap) break;
    }
    cursor = page.meta.next_cursor ?? '';
  }

  return out;
}
