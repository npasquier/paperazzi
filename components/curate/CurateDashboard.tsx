'use client';

// Curation dashboard — a focus-tool for OpenAlex corrections.
//
// Two MECHANISMS (modes), picked with the tab selector:
//   • Abstract missing — works with a DOI but no abstract; recover + submit.
//   • Duplicates       — works sharing a title + year; merge the copies.
//
// Each mode is described by a ModeConfig (see curateModes.ts): how to scan for
// candidates, an optional per-row phase-2 step (recover), and which correction
// edit type "Submit correction" uses. This component is the mode-agnostic shell
// driving scan → review → submit.
//
// Abstract scans turn up a lot of non-articles that legitimately have no
// abstract (front matter, referee acknowledgments, …). The NOISE FILTER lets
// the user choose, per category, which of those to hide — see utils/noiseFilters.
//
// Fully client-driven and stateless: results and noise choices live in
// localStorage (no database), matching the rest of Paperazzi. "Reported" flags
// are shared with the rest of the app via the same reportedPaperKey entries the
// paper cards use.

import { useEffect, useRef, useState } from 'react';
import Select from 'react-select';
import {
  ExternalLink,
  Loader2,
  Search,
  Square,
  RefreshCw,
  Trash2,
  CheckCircle,
  Filter,
} from 'lucide-react';
import { useActiveRanking } from '@/utils/activeRanking';
import { normalizeId } from '@/utils/normalizeId';
import { reportedPaperKey } from '@/utils/storageKeys';
import { emit } from '@/utils/eventBus';
import { openCorrectionForm } from '@/utils/correctionForms';
import {
  MODES,
  getMode,
  type CurateMode,
  type ScanRow,
} from '@/components/curate/curateModes';
import {
  NOISE_RULES,
  defaultNoiseHidden,
  isHiddenNoise,
  matchingNoiseRules,
  type NoiseTarget,
} from '@/utils/noiseFilters';

interface JournalOption {
  value: string; // ISSN
  label: string;
}

type ReportedFilter = 'all' | 'reported' | 'unreported';

const STORAGE_KEY = 'paperazzi-curate-v2';
const CURRENT_YEAR = new Date().getFullYear();
const VALID_MODES = new Set(MODES.map((m) => m.id));

type RowsByMode = Record<CurateMode, ScanRow[]>;
const emptyRowsByMode = (): RowsByMode => ({
  abstract: [],
  duplicate: [],
});

const noiseTarget = (r: ScanRow): NoiseTarget => ({
  title: r.title,
  authorCount: r.authorCount,
});

export default function CurateDashboard() {
  const ranking = useActiveRanking();

  const [mode, setMode] = useState<CurateMode>('abstract');
  const [journal, setJournal] = useState<JournalOption | null>(null);
  const [fromYear, setFromYear] = useState(2015);
  const [toYear, setToYear] = useState(CURRENT_YEAR);
  const [maxCandidates, setMaxCandidates] = useState(100);

  const [rowsByMode, setRowsByMode] = useState<RowsByMode>(emptyRowsByMode());
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const [reportedFilter, setReportedFilter] = useState<ReportedFilter>('all');
  // Per-category "hide this kind of non-article" choices (abstract mode).
  const [noiseHidden, setNoiseHidden] =
    useState<Record<string, boolean>>(defaultNoiseHidden);
  const [showNoisePanel, setShowNoisePanel] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [working, setWorking] = useState(false); // phase 2 in flight
  const [scanned, setScanned] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const cfg = getMode(mode);
  const rows = rowsByMode[mode];
  const noiseActive = mode === 'abstract';

  // One-time hydration from localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as {
          mode?: string;
          rowsByMode?: Partial<RowsByMode>;
          journal?: JournalOption | null;
          fromYear?: number;
          toYear?: number;
          maxCandidates?: number;
          noiseHidden?: Record<string, boolean>;
          reportedFilter?: ReportedFilter;
        };
        /* eslint-disable react-hooks/set-state-in-effect */
        if (saved.mode && VALID_MODES.has(saved.mode as CurateMode))
          setMode(saved.mode as CurateMode);
        if (saved.rowsByMode)
          setRowsByMode({ ...emptyRowsByMode(), ...saved.rowsByMode });
        if (saved.journal) setJournal(saved.journal);
        if (typeof saved.fromYear === 'number') setFromYear(saved.fromYear);
        if (typeof saved.toYear === 'number') setToYear(saved.toYear);
        if (typeof saved.maxCandidates === 'number')
          setMaxCandidates(saved.maxCandidates);
        if (saved.noiseHidden)
          setNoiseHidden({ ...defaultNoiseHidden(), ...saved.noiseHidden });
        if (saved.reportedFilter) setReportedFilter(saved.reportedFilter);
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      /* corrupt/empty — ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          mode,
          rowsByMode,
          journal,
          fromYear,
          toYear,
          maxCandidates,
          noiseHidden,
          reportedFilter,
        }),
      );
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [
    mode,
    rowsByMode,
    journal,
    fromYear,
    toYear,
    maxCandidates,
    noiseHidden,
    reportedFilter,
  ]);

  // Hydrate per-row "reported" flags from the shared reportedPaperKey entries.
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

  function setRows(updater: (prev: ScanRow[]) => ScanRow[]) {
    setRowsByMode((prev) => ({ ...prev, [mode]: updater(prev[mode]) }));
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

  function setNoiseRule(id: string, hide: boolean) {
    setNoiseHidden((prev) => ({ ...prev, [id]: hide }));
  }
  function setAllNoise(hide: boolean) {
    setNoiseHidden(
      Object.fromEntries(NOISE_RULES.map((r) => [r.id, hide])) as Record<
        string,
        boolean
      >,
    );
  }

  const journalOptions: JournalOption[] = (ranking?.journals ?? [])
    .filter((j) => j.issn)
    .map((j) => ({ value: j.issn, label: `${j.name} (${j.issn})` }));

  // ── Phase 1: scan for candidates ──────────────────────────────────────────
  async function scan() {
    if (scanning || working || !journal) return;
    setError(null);
    stopRef.current = false;
    setScanning(true);
    setScanned(0);
    setRows(() => []);
    setProgress({ done: 0, total: 0 });
    try {
      const candidates = await cfg.scan({
        issn: journal.value,
        fromYear,
        toYear,
        cap: maxCandidates,
        shouldStop: () => stopRef.current,
        onProgress: (n) => setScanned(n),
      });
      setRows(() =>
        candidates.map((c) => ({ ...c, selected: false, status: 'idle' })),
      );
    } catch (e) {
      setError((e as Error).message || 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  // ── Phase 2: per-row recover ──────────────────────────────────────────────
  async function runRow(workId: string) {
    if (!cfg.phase2) return;
    const row = rows.find((r) => r.workId === workId);
    if (!row) return;
    setRowsBy(workId, (r) => ({ ...r, status: 'working' }));
    try {
      const patch = await cfg.phase2.run({ ...row, status: 'working' });
      setRowsBy(workId, (r) => ({ ...r, ...patch }));
    } catch {
      setRowsBy(workId, (r) => ({ ...r, status: 'error' }));
    }
  }

  async function runMany(targets: ScanRow[]) {
    if (working || !cfg.phase2 || targets.length === 0) return;
    stopRef.current = false;
    setWorking(true);
    setProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      if (stopRef.current) break;
      await runRow(targets[i].workId);
      setProgress({ done: i + 1, total: targets.length });
    }
    setWorking(false);
  }
  function runSelected() {
    return runMany(rows.filter((r) => r.selected && r.status !== 'working'));
  }
  function runAllVisible() {
    return runMany(visibleRows.filter((r) => r.status !== 'working'));
  }
  function clearResults() {
    setRows(() => []);
    setProgress({ done: 0, total: 0 });
    setScanned(0);
  }

  // ── Row helpers ───────────────────────────────────────────────────────────
  function setRowsBy(workId: string, fn: (r: ScanRow) => ScanRow) {
    setRows((prev) => prev.map((r) => (r.workId === workId ? fn(r) : r)));
  }
  function toggleSelect(workId: string) {
    setRowsBy(workId, (r) => ({ ...r, selected: !r.selected }));
  }
  function selectAllVisible(on: boolean) {
    const visibleIds = new Set(visibleRows.map((r) => r.workId));
    setRows((prev) =>
      prev.map((r) => (visibleIds.has(r.workId) ? { ...r, selected: on } : r)),
    );
  }

  function submitCorrection(r: ScanRow) {
    void openCorrectionForm(r.workId, cfg.correctionTypeId, {
      abstract: cfg.id === 'abstract' ? r.result : undefined,
    });
  }

  // ── Derived view state ────────────────────────────────────────────────────
  const visibleRows = rows.filter((r) => {
    if (noiseActive && isHiddenNoise(noiseTarget(r), noiseHidden)) return false;
    if (reportedFilter === 'reported' && !isReported(r.workId)) return false;
    if (reportedFilter === 'unreported' && isReported(r.workId)) return false;
    return true;
  });
  const noiseCount = noiseActive
    ? rows.filter((r) => isHiddenNoise(noiseTarget(r), noiseHidden)).length
    : 0;
  const selectedCount = rows.filter((r) => r.selected).length;
  const okCount = rows.filter((r) => r.status === 'ok').length;
  const reportedCount = rows.filter((r) => isReported(r.workId)).length;
  const busy = scanning || working;

  // Per-rule match counts for the noise panel.
  const noiseRuleCounts: Record<string, number> = {};
  if (noiseActive) {
    for (const rule of NOISE_RULES) {
      noiseRuleCounts[rule.id] = rows.filter((r) =>
        rule.test(noiseTarget(r)),
      ).length;
    }
  }

  return (
    <div className='space-y-6'>
      <header>
        <h1 className='text-2xl font-semibold text-[var(--foreground)]'>
          Curate · {cfg.heading}
        </h1>
        <p className='mt-1 text-sm text-[var(--muted-foreground,#666)]'>
          {cfg.blurb}
        </p>
      </header>

      {/* Mode selector */}
      <div className='flex flex-wrap gap-1.5'>
        {MODES.map((m) => {
          const active = m.id === mode;
          return (
            <button
              key={m.id}
              onClick={() => {
                if (busy) return;
                setMode(m.id);
                setError(null);
              }}
              disabled={busy}
              className={
                'rounded-full px-3 py-1 text-sm font-medium transition disabled:opacity-50 ' +
                (active
                  ? 'bg-[var(--primary,#2563eb)] text-white'
                  : 'border border-[var(--border,#ccc)] text-[var(--muted-foreground,#555)] hover:bg-[var(--muted,#f3f3f3)]')
              }
            >
              {m.tab}
            </button>
          );
        })}
      </div>

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
          <span className='mb-1 block font-medium'>
            {mode === 'duplicate' ? 'Max in groups' : 'Max papers'}
          </span>
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

      {/* Noise filter (abstract mode) */}
      {noiseActive && rows.length > 0 && (
        <div className='rounded-lg border border-[var(--border,#e5e5e5)]'>
          <button
            onClick={() => setShowNoisePanel((s) => !s)}
            className='flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium'
          >
            <span className='inline-flex items-center gap-2'>
              <Filter size={14} />
              Hide non-articles
              <span className='text-[var(--muted-foreground,#888)]'>
                ({noiseCount} hidden of {rows.length})
              </span>
            </span>
            <span className='text-[var(--muted-foreground,#888)]'>
              {showNoisePanel ? 'Hide options ▲' : 'Show options ▼'}
            </span>
          </button>
          {showNoisePanel && (
            <div className='border-t border-[var(--border,#eee)] px-4 py-3'>
              <div className='mb-2 flex items-center gap-3 text-xs'>
                <span className='text-[var(--muted-foreground,#888)]'>
                  Tick a category to hide it from the results below.
                </span>
                <button
                  onClick={() => setAllNoise(true)}
                  className='rounded border border-[var(--border,#ccc)] px-2 py-0.5 hover:bg-[var(--muted,#f3f3f3)]'
                >
                  Hide all
                </button>
                <button
                  onClick={() => setAllNoise(false)}
                  className='rounded border border-[var(--border,#ccc)] px-2 py-0.5 hover:bg-[var(--muted,#f3f3f3)]'
                >
                  Show all
                </button>
              </div>
              <div className='grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3'>
                {NOISE_RULES.map((rule) => {
                  const count = noiseRuleCounts[rule.id] ?? 0;
                  return (
                    <label
                      key={rule.id}
                      className={
                        'flex items-start gap-2 text-sm ' +
                        (count === 0
                          ? 'text-[var(--muted-foreground,#aaa)]'
                          : '')
                      }
                      title={rule.hint}
                    >
                      <input
                        type='checkbox'
                        className='mt-0.5'
                        checked={!!noiseHidden[rule.id]}
                        onChange={(e) => setNoiseRule(rule.id, e.target.checked)}
                      />
                      <span>
                        {rule.label}{' '}
                        <span className='text-[var(--muted-foreground,#999)]'>
                          ({count})
                        </span>
                        <span className='block text-[11px] text-[var(--muted-foreground,#aaa)]'>
                          {rule.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
          {cfg.phase2 && (
            <>
              <button
                onClick={runSelected}
                disabled={busy || selectedCount === 0}
                className='inline-flex items-center gap-2 rounded bg-[var(--primary,#2563eb)] px-3 py-1 font-medium text-white disabled:opacity-50'
              >
                {working ? (
                  <Loader2 size={14} className='animate-spin' />
                ) : (
                  <RefreshCw size={14} />
                )}
                {cfg.phase2.label} selected ({selectedCount})
              </button>
              <button
                onClick={runAllVisible}
                disabled={busy || visibleRows.length === 0}
                title={`Run “${cfg.phase2.label}” on every shown paper`}
                className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
              >
                <RefreshCw size={13} /> {cfg.phase2.label} all shown
              </button>
            </>
          )}
          <button
            onClick={clearResults}
            disabled={busy}
            title='Clear the results table'
            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-[var(--muted-foreground,#666)] hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
          >
            <Trash2 size={13} /> Clear results
          </button>

          {/* Reported filter */}
          <label className='ml-auto inline-flex items-center gap-1.5'>
            <span className='text-[var(--muted-foreground,#666)]'>Show</span>
            <select
              value={reportedFilter}
              onChange={(e) =>
                setReportedFilter(e.target.value as ReportedFilter)
              }
              className='rounded border border-[var(--border,#ccc)] px-2 py-1'
            >
              <option value='all'>All ({rows.length})</option>
              <option value='reported'>Reported ({reportedCount})</option>
              <option value='unreported'>
                Not reported ({rows.length - reportedCount})
              </option>
            </select>
          </label>
          <span className='text-[var(--muted-foreground,#666)]'>
            {working
              ? `${cfg.phase2?.activeLabel ?? 'Working'}… ${progress.done}/${progress.total}`
              : mode === 'abstract'
                ? `${visibleRows.length} shown · ${okCount} recovered · ${noiseCount} hidden`
                : `${visibleRows.length} shown`}
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
          Scanning OpenAlex… {scanned} records checked
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
                <th className='px-3 py-2 font-medium'>{cfg.resultHeader}</th>
                <th className='px-3 py-2 font-medium'>Reported</th>
                <th className='px-3 py-2 font-medium'>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const matched = noiseActive
                  ? matchingNoiseRules(noiseTarget(r))
                  : [];
                return (
                  <tr
                    key={r.workId}
                    className='border-b border-[var(--border,#f0f0f0)] align-top'
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
                        {r.doi ? (
                          <a
                            href={`https://doi.org/${r.doi}`}
                            target='_blank'
                            rel='noopener noreferrer'
                            title='Open the paper at its DOI'
                            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                          >
                            <ExternalLink size={12} /> DOI
                          </a>
                        ) : (
                          <span className='text-[10px] text-[var(--muted-foreground,#999)]'>
                            no DOI
                          </span>
                        )}
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
                      {matched.length > 0 && (
                        <span
                          className='ml-2 rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700'
                          title='Matches a non-article category (currently shown)'
                        >
                          likely non-article
                        </span>
                      )}
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      {r.year ?? '—'}
                    </td>
                    <td className='px-3 py-2 max-w-[380px]'>
                      <ResultCell row={r} mode={mode} />
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
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
                            : 'border-[var(--border,#ccc)] text-[var(--muted-foreground,#777)] hover:bg-[var(--muted,#f3f3f3)]')
                        }
                      >
                        <CheckCircle size={12} />
                        {isReported(r.workId) ? 'Reported' : 'Mark'}
                      </button>
                    </td>
                    <td className='px-3 py-2 whitespace-nowrap'>
                      <div className='flex flex-wrap gap-1'>
                        {cfg.phase2 && r.status !== 'working' && (
                          <button
                            onClick={() => runRow(r.workId)}
                            disabled={busy}
                            className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)] disabled:opacity-50'
                          >
                            <RefreshCw size={12} />{' '}
                            {r.status === 'idle' ? cfg.phase2.label : 'Re-run'}
                          </button>
                        )}
                        <button
                          onClick={() => submitCorrection(r)}
                          title='Open the correction form prefilled for this fix'
                          className='inline-flex items-center gap-1 rounded border border-[var(--border,#ccc)] px-2 py-1 text-xs hover:bg-[var(--muted,#f3f3f3)]'
                        >
                          <ExternalLink size={12} /> Submit correction
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

      {!scanning && rows.length > 0 && visibleRows.length === 0 && (
        <p className='text-sm text-[var(--muted-foreground,#888)]'>
          All {rows.length} listed rows are filtered out. Loosen the filters
          above to see them.
        </p>
      )}

      {!scanning && rows.length === 0 && journal && (
        <p className='text-sm text-[var(--muted-foreground,#888)]'>
          No results yet — run a scan.
        </p>
      )}
    </div>
  );
}

// ── Mode-specific result cell ───────────────────────────────────────────────
function ResultCell({ row, mode }: { row: ScanRow; mode: CurateMode }) {
  if (mode === 'duplicate') {
    return (
      <span className='inline-flex items-center gap-1.5'>
        <span className='rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800'>
          {row.groupSize ?? 2} copies
        </span>
        <span className='text-[10px] text-[var(--muted-foreground,#999)]'>
          same title + year
        </span>
      </span>
    );
  }

  // abstract mode
  if (row.status === 'idle') {
    return (
      <span className='text-[var(--muted-foreground,#999)]'>not recovered</span>
    );
  }
  if (row.status === 'working') {
    return <Loader2 size={14} className='animate-spin' />;
  }
  if (row.status === 'ok') {
    return (
      <>
        {row.source && (
          <span className='mr-2 rounded bg-[var(--muted,#eef)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide'>
            {row.source}
          </span>
        )}
        {row.result && row.result.length > 220
          ? row.result.slice(0, 220) + ' …'
          : row.result}
      </>
    );
  }
  if (row.status === 'fail') {
    return (
      <span className='text-[var(--muted-foreground,#999)]'>
        no abstract found
      </span>
    );
  }
  return <span className='text-[var(--destructive,#b91c1c)]'>error</span>;
}
