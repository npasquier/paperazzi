// Rankings editor — the only place where the active RankingScheme can be
// modified. Lives at `/rankings`. Three things keep it from being a giant
// blob:
//
//   1. Read-only baseline: every edit button is disabled until the user
//      clicks "Fork to edit", which clones the active scheme into a
//      user-owned copy in localStorage. We never mutate the built-in
//      CNRS data — `Reset to default` is just `removeItem` on the
//      override key.
//
//   2. Auto-save: every edit immediately calls `saveActiveRanking(...)`,
//      which writes localStorage and notifies every subscriber. The
//      FilterPanel + JournalModal pick up the new scheme on the next
//      render, so the user sees their changes reflected immediately
//      without a "Save" button to forget about.
//
//   3. Tabbed layout: Info / Journals / Tiers / Domains. The journals
//      table is the only heavy widget — it's filtered + paginated client-
//      side rather than virtualised, which is plenty fast for the
//      ~1.5k–5k row scale we're at.
//
// Import/export use the same JSON shape as `RankingScheme` (the type
// itself). The validator in `utils/activeRanking.ts` is the gatekeeper —
// nothing reaches localStorage that didn't pass it.

'use client';

import { DragEvent, useCallback, useMemo, useState } from 'react';
import {
  Download,
  Upload,
  RotateCcw,
  GitFork,
  Plus,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink as ExternalLinkIcon,
  Info,
  Pencil,
  CheckCircle2,
} from 'lucide-react';
import type {
  Journal,
  RankingDomain,
  RankingScheme,
  RankingTier,
} from '@/types/interfaces';
import {
  hasUserOverride,
  loadActiveRanking,
  saveActiveRanking,
  useActiveRanking,
  validateRankingScheme,
} from '@/utils/activeRanking';

// ─── Types ──────────────────────────────────────────────────────────────

type TabId = 'info' | 'journals' | 'tiers' | 'domains';

// ─── Small utilities ────────────────────────────────────────────────────

function deepClone<T>(value: T): T {
  // JSON round-trip is enough — RankingScheme is plain data.
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Returns a fresh copy of the scheme with a different id + name so it
 *  reads as the user's own from now on. Used by "Fork to edit". */
function forkScheme(source: RankingScheme): RankingScheme {
  const stamp = new Date().toISOString().slice(0, 10);
  return {
    ...deepClone(source),
    id: `${source.id}-fork-${Date.now()}`,
    name: `${source.name} (edited ${stamp})`,
  };
}

// ─── Component ──────────────────────────────────────────────────────────

export default function RankingsEditor() {
  const active = useActiveRanking();
  const [tab, setTab] = useState<TabId>('journals');
  const [confirmReset, setConfirmReset] = useState(false);
  // Pending-import state: a parsed-and-validated scheme awaiting user
  // confirmation. Null when no import is in progress.
  const [pendingImport, setPendingImport] = useState<RankingScheme | null>(
    null,
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [flashMessage, setFlashMessage] = useState<string | null>(null);

  // Briefly show a flash banner ("Imported", "Reset", "Forked") so the
  // user gets feedback that their action took effect.
  const flash = useCallback((msg: string) => {
    setFlashMessage(msg);
    window.setTimeout(() => setFlashMessage(null), 2200);
  }, []);

  // Whether the user has an override saved. We need to call hasUserOverride()
  // every render because saveActiveRanking() doesn't update React state for
  // this flag — but it does notify subscribers, so re-derive on every active
  // change.
  const editable = active != null && hasUserOverride();

  // ── Editing primitives ─────────────────────────────────────────────
  // Every mutation goes through `update`, which clones the active scheme,
  // applies a recipe, validates the result, and saves. Validation here is
  // belt-and-braces — the editor builds well-formed schemes by
  // construction, but if a future bug slips a malformed one through, the
  // saver still rejects it.
  const update = useCallback(
    (recipe: (draft: RankingScheme) => void) => {
      if (!active || !editable) return;
      const draft = deepClone(active);
      recipe(draft);
      if (!validateRankingScheme(draft)) {
        console.error('[RankingsEditor] update produced invalid scheme', draft);
        return;
      }
      saveActiveRanking(draft);
    },
    [active, editable],
  );

  const handleFork = useCallback(async () => {
    const source = active ?? (await loadActiveRanking());
    const forked = forkScheme(source);
    if (saveActiveRanking(forked)) {
      flash('Forked — you can now edit this scheme.');
    }
  }, [active, flash]);

  const handleReset = useCallback(() => {
    if (saveActiveRanking(null)) {
      flash('Reset to the built-in scheme.');
      setConfirmReset(false);
    }
  }, [flash]);

  const handleExport = useCallback(() => {
    if (!active) return;
    const blob = new Blob([JSON.stringify(active, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${active.id || 'ranking'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [active]);

  // ── Import flow ────────────────────────────────────────────────────
  // Two entry points (file picker, drag-and-drop) funnel into the same
  // parse+validate+confirm pipeline.
  const ingestFile = useCallback(async (file: File) => {
    setImportError(null);
    if (file.size > 5 * 1024 * 1024) {
      setImportError(
        'File is larger than 5 MB — too big for a ranking scheme.',
      );
      return;
    }
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      if (!validateRankingScheme(parsed)) {
        setImportError(
          'That file is not a valid ranking scheme. Expected a JSON object with version, tiers, domains, and journals.',
        );
        return;
      }
      setPendingImport(parsed);
    } catch (err) {
      setImportError(
        err instanceof Error
          ? `Failed to read file: ${err.message}`
          : 'Failed to read file.',
      );
    }
  }, []);

  const confirmImport = useCallback(() => {
    if (!pendingImport) return;
    if (saveActiveRanking(pendingImport)) {
      flash(`Imported ${pendingImport.name}.`);
      setPendingImport(null);
    }
  }, [pendingImport, flash]);

  // ─── Render ─────────────────────────────────────────────────────────

  if (!active) {
    return (
      <div className='py-12 text-center text-app-soft text-sm'>
        Loading ranking…
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      {/* Flash banner — ephemeral feedback. */}
      {flashMessage && (
        <div className='banner-success flex items-center gap-2 px-3 py-2 rounded-lg text-sm'>
          <CheckCircle2 size={14} />
          <span>{flashMessage}</span>
        </div>
      )}

      <Header
        scheme={active}
        editable={editable}
        onFork={handleFork}
        onResetClick={() => setConfirmReset(true)}
        onExport={handleExport}
      />

      {/* Set-up panel: explains the three workflows (edit in place,
          load a community-shared ranking, or build from a published
          list) and provides the dropzone that paths 2 and 3 land on. */}
      <ImportPanel
        onFile={ingestFile}
        importError={importError}
        clearError={() => setImportError(null)}
      />

      {/* Inline format docs — collapsed by default so the editor stays
          uncluttered; users authoring their first JSON open it once and
          remember the shape. The Help page carries the canonical version. */}
      <FormatHelp />

      <Tabs current={tab} onChange={setTab} scheme={active} />

      <div className='surface-card border border-app rounded-lg p-4'>
        {tab === 'info' && (
          <InfoTab scheme={active} editable={editable} update={update} />
        )}
        {tab === 'journals' && (
          <JournalsTab scheme={active} editable={editable} update={update} />
        )}
        {tab === 'tiers' && (
          <TiersTab scheme={active} editable={editable} update={update} />
        )}
        {tab === 'domains' && (
          <DomainsTab scheme={active} editable={editable} update={update} />
        )}
      </div>

      {/* Reset-to-default confirmation. */}
      {confirmReset && (
        <ConfirmModal
          title='Reset to default ranking?'
          body='Your edits will be discarded and the built-in CNRS scheme will become active again. This cannot be undone.'
          confirmLabel='Reset'
          confirmTone='danger'
          onConfirm={handleReset}
          onCancel={() => setConfirmReset(false)}
        />
      )}

      {/* Import confirmation — show shape summary before commit. */}
      {pendingImport && (
        <ConfirmModal
          title={`Import "${pendingImport.name}"?`}
          body={
            <div className='space-y-1 text-sm text-app-muted'>
              <div>
                {pendingImport.journals.length.toLocaleString()} journals,{' '}
                {pendingImport.tiers.length} tier
                {pendingImport.tiers.length === 1 ? '' : 's'},{' '}
                {pendingImport.domains.length} domain
                {pendingImport.domains.length === 1 ? '' : 's'}.
              </div>
              <div className='text-app-soft'>
                Your current ranking will be replaced. You can switch back to
                the built-in default at any time with Reset.
              </div>
            </div>
          }
          confirmLabel='Import'
          confirmTone='primary'
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────────────────

function Header({
  scheme,
  editable,
  onFork,
  onResetClick,
  onExport,
}: {
  scheme: RankingScheme;
  editable: boolean;
  onFork: () => void;
  onResetClick: () => void;
  onExport: () => void;
}) {
  return (
    <div className='surface-card border border-app rounded-lg p-4'>
      <div className='flex items-start justify-between gap-4 flex-wrap'>
        <div className='min-w-0'>
          <div className='flex items-center gap-2 flex-wrap'>
            <h1 className='text-xl font-semibold text-stone-900'>
              {scheme.name}
            </h1>
            {!editable && (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded chip-muted text-stone-600'>
                Built-in baseline (read-only)
              </span>
            )}
            {editable && (
              <span className='inline-flex items-center gap-1 px-2 py-0.5 text-[11px] rounded badge-accent'>
                Editable
              </span>
            )}
          </div>
          {scheme.description && (
            <p className='text-sm text-app-muted mt-1'>{scheme.description}</p>
          )}
          <p className='text-[11px] text-app-soft mt-1'>
            Schema version v{scheme.version} · id <code>{scheme.id}</code>
          </p>
        </div>
        <div className='flex items-center gap-2 flex-wrap'>
          {!editable ? (
            <button
              onClick={onFork}
              className='inline-flex items-center gap-1 px-3 py-1.5 button-primary rounded-lg text-sm'
              title='Make a personal copy of the built-in scheme so you can edit it.'
            >
              <GitFork size={14} />
              Fork to edit
            </button>
          ) : (
            <button
              onClick={onResetClick}
              className='inline-flex items-center gap-1 px-3 py-1.5 button-secondary rounded-lg text-sm'
              title='Discard your edits and restore the built-in CNRS scheme.'
            >
              <RotateCcw size={14} />
              Reset to default
            </button>
          )}
          <button
            onClick={onExport}
            className='inline-flex items-center gap-1 px-3 py-1.5 button-secondary rounded-lg text-sm'
            title='Download the active ranking as a JSON file.'
          >
            <Download size={14} />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Set-up panel ──────────────────────────────────────────────────────
//
// Three workflows live on this page — editing the current ranking,
// loading a community-shared one, or building one from a published
// list. The panel below names all three side by side so the user
// understands their options up front, then presents the dropzone as
// the common landing pad for paths (2) and (3). Path (1) is just a
// pointer to the editor controls below.

interface ImportPanelProps {
  onFile: (file: File) => void;
  importError: string | null;
  clearError: () => void;
}

function ImportPanel({ onFile, importError, clearError }: ImportPanelProps) {
  return (
    <div className='surface-card border border-app rounded-lg p-4 space-y-4'>
      <div>
        <h2 className='text-sm font-semibold text-stone-900'>
          Set up your ranking
        </h2>
        <p className='text-xs text-app-muted mt-1'>
          Three ways to land on the right list — pick whichever fits how you
          already keep track of journals.
        </p>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
        <WorkflowCard
          number={1}
          title='Edit the current ranking'
          body={
            <>
              Click <strong>Fork to edit</strong> above to start customising
              the built-in CNRS scheme — rename tiers, add domains, edit
              per-journal assignments in the tabs below. <em>Reset to
              default</em> always brings the baseline back.
            </>
          }
        />
        <WorkflowCard
          number={2}
          title='Use a community ranking'
          body={
            <>
              Grab a ready-made JSON (HCERES, CNU, …) from the examples
              repository, then drop it on the dropzone below.
            </>
          }
          link={{
            href: 'https://github.com/npasquier/rankings',
            label: 'Open the examples on GitHub',
          }}
        />
        <WorkflowCard
          number={3}
          title='Build one from a published list'
          body={
            <>
              Most discipline-specific rankings circulate as PDFs. Convert
              one to the JSON shape below (the editor accepts it), drop the
              file here, and you&apos;re done.
            </>
          }
          link={{
            href: 'https://www.robertholcman.net/index.php/classements-de-revues/',
            label: 'Examples of published rankings',
          }}
        />
      </div>

      {/* Common landing pad for paths 2 and 3. */}
      <Dropzone onFile={onFile} />

      {importError && (
        <div className='banner-danger flex items-start gap-2 px-3 py-2 rounded-lg text-sm'>
          <AlertTriangle size={14} className='mt-0.5 flex-shrink-0' />
          <div className='flex-1'>{importError}</div>
          <button onClick={clearError} className='text-app-soft hover:text-app'>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** One of the three numbered workflow cards in the set-up panel. */
function WorkflowCard({
  number,
  title,
  body,
  link,
}: {
  number: number;
  title: string;
  body: React.ReactNode;
  link?: { href: string; label: string };
}) {
  return (
    <div className='surface-subtle border border-app rounded-lg p-3 flex flex-col gap-2'>
      <div className='flex items-center gap-2'>
        <span className='inline-flex items-center justify-center w-5 h-5 rounded-full surface-card text-[11px] font-semibold text-app-muted border border-app'>
          {number}
        </span>
        <h3 className='text-sm font-medium text-stone-900 leading-tight'>
          {title}
        </h3>
      </div>
      <p className='text-xs text-app-muted leading-relaxed flex-1'>{body}</p>
      {link && (
        <a
          href={link.href}
          target='_blank'
          rel='noopener noreferrer'
          className='inline-flex items-center gap-1 text-xs text-accent-strong hover:underline'
        >
          {link.label}
          <ExternalLinkIcon size={11} />
        </a>
      )}
    </div>
  );
}

/** The drag-and-drop tile. Smaller than before — the explanatory copy
 *  now lives in the workflow cards above, so this is just the action. */
function Dropzone({ onFile }: { onFile: (file: File) => void }) {
  const [hovering, setHovering] = useState(false);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setHovering(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setHovering(true);
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-lg px-3 py-4 text-center text-xs transition ${
        hovering
          ? 'border-accent-strong bg-[var(--surface-muted)]'
          : 'border-app-muted text-app-soft'
      }`}
    >
      <Upload size={14} className='inline-block mr-1 -mt-0.5' />
      Drop a ranking JSON file here to load it as the active scheme.
    </div>
  );
}

// ─── Format help (collapsible) ──────────────────────────────────────────
//
// A compact summary of the JSON shape, expandable on demand. The /help
// page carries the full doc — this is the at-a-glance reminder for users
// authoring or editing a scheme by hand. Click to expand.

function FormatHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className='surface-card border border-app rounded-lg overflow-hidden text-sm'>
      <button
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-center justify-between px-3 py-2 hover:bg-[var(--surface-muted)] transition'
        aria-expanded={open}
      >
        <span className='inline-flex items-center gap-2 text-app-muted text-xs'>
          <Info size={13} />
          What does a ranking JSON look like?
        </span>
        {open ? (
          <ChevronDown size={14} className='text-app-soft' />
        ) : (
          <ChevronRight size={14} className='text-app-soft' />
        )}
      </button>
      {open && (
        <div className='border-t border-app px-4 py-4 space-y-3 bg-[var(--surface-subtle)]'>
          <p className='text-app-muted leading-relaxed'>
            A ranking is a single, self-contained JSON file. It declares its own
            tiers, domains, and journals — nothing is inherited from the
            built-in CNRS scheme, so if you want CNRS-style domains they have to
            be listed in your file. Minimum shape:
          </p>
          <pre className='surface-muted border border-app rounded-md p-3 text-[11px] leading-relaxed overflow-x-auto font-mono'>
            {`{
  "version": 1,
  "id": "hceres-2021",
  "name": "HCERES 2021",
  "tiers":   [{ "key": "A" }, { "key": "B" }, { "key": "C" }],
  "domains": [{ "key": "GEN", "label": "General" }],
  "journals": [
    { "issn": "0002-8282",
      "name": "American Economic Review",
      "tier": "A",
      "domain": "GEN" }
  ]
}`}
          </pre>
          <ul className='list-disc pl-5 space-y-1 text-app-muted leading-relaxed text-xs'>
            <li>
              <strong>Tier keys</strong> are arbitrary strings{' '}
              {'("1"/"2", "A"/"B"/"C", "Q1"/"Q2"…)'}. They show up on the filter
              pills as-is.
            </li>
            <li>
              {'Every journal’s '}
              <code>tier</code> and <code>domain</code> must match a key
              declared above; unknown keys still load but show as{' '}
              <em>(unknown)</em> in the editor.
            </li>
            <li>
              Optional fields: <code>description</code>, <code>label</code> on
              tiers/domains, <code>presets</code>{' '}
              {'(shortcut buttons like "Top 5").'}
            </li>
            <li>
              Tip: click <strong>Export</strong> above to download the
              currently-active scheme as JSON and use it as a template.
            </li>
          </ul>
          <p className='text-app-soft text-[11px]'>
            Full walkthrough on the{' '}
            <a href='/help#rankings' className='underline hover:text-app-muted'>
              Help page
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Tabs ───────────────────────────────────────────────────────────────

function Tabs({
  current,
  onChange,
  scheme,
}: {
  current: TabId;
  onChange: (t: TabId) => void;
  scheme: RankingScheme;
}) {
  const counts: Record<TabId, string> = {
    info: '',
    journals: scheme.journals.length.toLocaleString(),
    tiers: String(scheme.tiers.length),
    domains: String(scheme.domains.length),
  };
  const tabs: { id: TabId; label: string }[] = [
    { id: 'info', label: 'Info' },
    { id: 'journals', label: 'Journals' },
    { id: 'tiers', label: 'Tiers' },
    { id: 'domains', label: 'Domains' },
  ];
  return (
    <div className='flex items-center gap-1 surface-subtle border border-app rounded-lg p-1 w-fit'>
      {tabs.map((t) => {
        const active = current === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3 py-1 text-sm rounded-md transition ${
              active
                ? 'surface-card text-app font-medium shadow-sm'
                : 'text-app-muted hover:text-app'
            }`}
          >
            {t.label}
            {counts[t.id] && (
              <span className='ml-1 text-[11px] text-app-soft'>
                ({counts[t.id]})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Info tab ───────────────────────────────────────────────────────────

function InfoTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: (recipe: (draft: RankingScheme) => void) => void;
}) {
  return (
    <div className='space-y-4 max-w-2xl'>
      <div>
        <label className='text-xs font-medium text-app-muted block mb-1'>
          Name
        </label>
        <input
          type='text'
          value={scheme.name}
          disabled={!editable}
          onChange={(e) =>
            update((d) => {
              d.name = e.target.value || d.name;
            })
          }
          className='w-full px-3 py-2 border border-app rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed'
        />
      </div>
      <div>
        <label className='text-xs font-medium text-app-muted block mb-1'>
          Description
        </label>
        <textarea
          value={scheme.description ?? ''}
          disabled={!editable}
          onChange={(e) =>
            update((d) => {
              d.description = e.target.value;
            })
          }
          rows={4}
          className='w-full px-3 py-2 border border-app rounded-lg text-sm disabled:opacity-60 disabled:cursor-not-allowed'
        />
      </div>
      {!editable && (
        <p className='text-[11px] text-app-soft flex items-start gap-1'>
          <Info size={12} className='mt-0.5 flex-shrink-0' />
          Click &ldquo;Fork to edit&rdquo; above to make this scheme editable.
        </p>
      )}
    </div>
  );
}

// ─── Tier / Domain tabs (unified) ──────────────────────────────────────
//
// Tiers and domains share every piece of behaviour — same row shape (key
// + label + cascading usage count), same add form, same delete flow
// (no-warning for empty buckets, cascade-with-confirm otherwise). The
// generic `KeyedListEditor` does all the rendering; the `TiersTab` /
// `DomainsTab` wrappers below just compute the usage-by-key map and
// hand it the recipes that touch `scheme.tiers` vs `scheme.domains`.

interface KeyedItem {
  key: string;
  label?: string;
}

interface KeyedListEditorProps {
  /** The items to render — RankingTier[] or RankingDomain[]. */
  items: readonly KeyedItem[];
  /** Whether the user can edit. */
  editable: boolean;
  /** Per-key journal-usage count, drives cascade-delete confirmation. */
  usageByKey: Map<string, number>;
  /** Singular noun for UI strings ("tier", "domain"). */
  noun: string;
  /** Lead paragraph at the top of the panel. */
  intro: React.ReactNode;
  /** Empty-state copy when items is []. */
  emptyHint: string;
  /** Placeholder for the Key input on the add form. */
  addPlaceholder: string;
  /** Add a new item. Caller is responsible for dedupe at the scheme level. */
  onAdd: (key: string, label: string) => void;
  /** Rename an item. Caller cascades the key change to every journal. */
  onRename: (oldKey: string, nextKey: string, nextLabel: string) => void;
  /** Delete an item that has no journals using it (one-click). */
  onDelete: (key: string) => void;
  /** Delete the item AND every journal that references it (confirm path). */
  onCascadeDelete: (key: string) => void;
}

function KeyedListEditor({
  items,
  editable,
  usageByKey,
  noun,
  intro,
  emptyHint,
  addPlaceholder,
  onAdd,
  onRename,
  onDelete,
  onCascadeDelete,
}: KeyedListEditorProps) {
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  // Surface the cascade-delete warning ("X journals will also be deleted")
  // before commit. Only entered when the targeted item is non-empty —
  // empty items delete in one click.
  const [pendingDelete, setPendingDelete] = useState<{
    key: string;
    label?: string;
    count: number;
  } | null>(null);

  const addItem = () => {
    const key = newKey.trim();
    if (!key) return;
    if (items.some((x) => x.key === key)) return; // dedupe at UI layer
    onAdd(key, newLabel.trim());
    setNewKey('');
    setNewLabel('');
  };

  return (
    <div className='space-y-4'>
      <p className='text-sm text-app-muted'>{intro}</p>

      <div className='border border-app rounded-lg overflow-hidden'>
        <div className='grid grid-cols-[1fr_2fr_auto_auto] gap-3 px-3 py-2 surface-subtle text-[11px] uppercase tracking-wider text-app-soft border-b border-app'>
          <div>Key</div>
          <div>Label (optional)</div>
          <div>Journals</div>
          <div></div>
        </div>
        {items.length === 0 && (
          <div className='px-3 py-6 text-center text-sm text-app-soft'>
            {emptyHint}
          </div>
        )}
        {items.map((item) => {
          const count = usageByKey.get(item.key) ?? 0;
          return (
            <KeyedListRow
              key={item.key}
              item={item}
              count={count}
              editable={editable}
              noun={noun}
              onRename={(nextKey, nextLabel) =>
                onRename(item.key, nextKey, nextLabel)
              }
              onDelete={() => {
                if (count === 0) {
                  onDelete(item.key);
                } else {
                  setPendingDelete({
                    key: item.key,
                    label: item.label,
                    count,
                  });
                }
              }}
            />
          );
        })}
      </div>

      {editable && (
        <div className='border border-app rounded-lg p-3 surface-subtle'>
          <p className='text-xs font-medium text-app-muted mb-2'>
            Add a {noun}
          </p>
          <div className='flex gap-2'>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={addPlaceholder}
              className='flex-1 px-2 py-1 text-sm border border-app rounded'
            />
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder='Label (optional)'
              className='flex-1 px-2 py-1 text-sm border border-app rounded'
            />
            <button
              onClick={addItem}
              disabled={!newKey.trim()}
              className='inline-flex items-center gap-1 px-3 py-1 button-primary rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed'
            >
              <Plus size={14} />
              Add
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete ${noun} "${
            pendingDelete.label || pendingDelete.key
          }"?`}
          body={
            <div className='space-y-1 text-sm text-app-muted'>
              <div>
                The {noun} will be removed from the scheme,{' '}
                <strong>
                  along with the {pendingDelete.count.toLocaleString()} journal
                  {pendingDelete.count === 1 ? '' : 's'}
                </strong>{' '}
                currently assigned to it.
              </div>
              <div className='text-app-soft'>
                This cannot be undone — the only way back is to import the
                scheme again, or click <em>Reset to default</em> if you want to
                discard all of your edits.
              </div>
            </div>
          }
          confirmLabel={`Delete ${noun} and its journals`}
          confirmTone='danger'
          onConfirm={() => {
            onCascadeDelete(pendingDelete.key);
            setPendingDelete(null);
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function KeyedListRow({
  item,
  count,
  editable,
  noun,
  onRename,
  onDelete,
}: {
  item: KeyedItem;
  count: number;
  editable: boolean;
  noun: string;
  onRename: (nextKey: string, nextLabel: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftKey, setDraftKey] = useState(item.key);
  const [draftLabel, setDraftLabel] = useState(item.label ?? '');
  // Keep drafts in sync if the prop changes underneath us. Previous-prop
  // comparison during render avoids the React 19 setState-in-useEffect
  // anti-pattern.
  const [prevSig, setPrevSig] = useState(`${item.key} ${item.label ?? ''}`);
  const sig = `${item.key} ${item.label ?? ''}`;
  if (prevSig !== sig) {
    setPrevSig(sig);
    setDraftKey(item.key);
    setDraftLabel(item.label ?? '');
  }

  const commit = () => {
    const key = draftKey.trim();
    if (key) onRename(key, draftLabel.trim());
    setEditing(false);
  };

  return (
    <div className='grid grid-cols-[1fr_2fr_auto_auto] gap-3 items-center px-3 py-2 border-b border-app last:border-b-0 text-sm'>
      {editing ? (
        <>
          <input
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            className='px-2 py-1 border border-app rounded text-sm'
          />
          <input
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder='Label'
            className='px-2 py-1 border border-app rounded text-sm'
          />
        </>
      ) : (
        <>
          <code className='text-app font-medium'>{item.key}</code>
          <span className='text-app-muted'>
            {item.label || (
              <span className='text-app-soft italic'>(no label)</span>
            )}
          </span>
        </>
      )}
      <span className='text-[11px] text-app-soft text-right'>
        {count.toLocaleString()}
      </span>
      <div className='flex items-center gap-1 justify-end'>
        {editable && !editing && (
          <button
            onClick={() => setEditing(true)}
            className='p-1 text-app-soft hover:text-app'
            title='Rename'
          >
            <Pencil size={12} />
          </button>
        )}
        {editable && editing && (
          <button
            onClick={commit}
            className='px-2 py-0.5 button-primary rounded text-xs'
          >
            Save
          </button>
        )}
        {editable && !editing && (
          <button
            onClick={onDelete}
            className='p-1 text-app-soft hover:text-danger'
            title={
              count > 0
                ? `Delete this ${noun} and its ${count.toLocaleString()} journal${
                    count === 1 ? '' : 's'
                  }`
                : 'Delete'
            }
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Tiers tab ──────────────────────────────────────────────────────────

function TiersTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: (recipe: (draft: RankingScheme) => void) => void;
}) {
  const usageByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of scheme.journals) m.set(j.tier, (m.get(j.tier) ?? 0) + 1);
    return m;
  }, [scheme.journals]);

  return (
    <KeyedListEditor
      items={scheme.tiers}
      editable={editable}
      usageByKey={usageByKey}
      noun='tier'
      addPlaceholder='Key (e.g. Q1)'
      emptyHint='No tiers yet. Add one below.'
      intro={
        <>
          Tiers are the buckets every journal is sorted into (e.g. CNRS uses
          1–4; a JCR-style ranking would use Q1–Q4). The <strong>key</strong> is
          the stable identifier stored on each journal — renaming it cascades to
          every journal that uses it.
        </>
      }
      onAdd={(key, label) =>
        update((d) => {
          if (d.tiers.some((t) => t.key === key)) return;
          d.tiers.push({ key, label: label || undefined });
        })
      }
      onRename={(oldKey, nextKey, nextLabel) =>
        update((d) => {
          const idx = d.tiers.findIndex((t) => t.key === oldKey);
          if (idx < 0) return;
          if (nextKey !== oldKey) {
            if (d.tiers.some((t) => t.key === nextKey)) return; // dedupe
            for (const j of d.journals) {
              if (j.tier === oldKey) j.tier = nextKey;
            }
          }
          d.tiers[idx] = { key: nextKey, label: nextLabel || undefined };
        })
      }
      onDelete={(key) =>
        update((d) => {
          d.tiers = d.tiers.filter((t) => t.key !== key);
        })
      }
      onCascadeDelete={(key) =>
        update((d) => {
          d.tiers = d.tiers.filter((t) => t.key !== key);
          d.journals = d.journals.filter((j) => j.tier !== key);
        })
      }
    />
  );
}

// ─── Domains tab ───────────────────────────────────────────────────

function DomainsTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: (recipe: (draft: RankingScheme) => void) => void;
}) {
  const usageByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of scheme.journals)
      m.set(j.domain, (m.get(j.domain) ?? 0) + 1);
    return m;
  }, [scheme.journals]);

  return (
    <KeyedListEditor
      items={scheme.domains}
      editable={editable}
      usageByKey={usageByKey}
      noun='domain'
      addPlaceholder='Key (e.g. Cardio)'
      emptyHint='No domains yet. Add one below.'
      intro={
        <>
          Domains are subject areas (CNRS Economics calls them GEN, OrgInd,
          etc.; a medical scheme might use cardiology, oncology, …). Renaming a
          domain&apos;s key cascades to every journal that uses it.
        </>
      }
      onAdd={(key, label) =>
        update((d) => {
          if (d.domains.some((x) => x.key === key)) return;
          d.domains.push({ key, label: label || undefined });
        })
      }
      onRename={(oldKey, nextKey, nextLabel) =>
        update((d) => {
          const idx = d.domains.findIndex((x) => x.key === oldKey);
          if (idx < 0) return;
          if (nextKey !== oldKey) {
            if (d.domains.some((x) => x.key === nextKey)) return;
            for (const j of d.journals) {
              if (j.domain === oldKey) j.domain = nextKey;
            }
          }
          d.domains[idx] = { key: nextKey, label: nextLabel || undefined };
        })
      }
      onDelete={(key) =>
        update((d) => {
          d.domains = d.domains.filter((x) => x.key !== key);
        })
      }
      onCascadeDelete={(key) =>
        update((d) => {
          d.domains = d.domains.filter((x) => x.key !== key);
          d.journals = d.journals.filter((j) => j.domain !== key);
        })
      }
    />
  );
}

// ─── Journals tab ───────────────────────────────────────────────────────

const JOURNALS_PAGE_SIZE = 50;

function JournalsTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: (recipe: (draft: RankingScheme) => void) => void;
}) {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [domainFilter, setDomainFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scheme.journals.filter((j) => {
      if (tierFilter && j.tier !== tierFilter) return false;
      if (domainFilter && j.domain !== domainFilter) return false;
      if (!q) return true;
      return (
        j.name.toLowerCase().includes(q) || j.issn.toLowerCase().includes(q)
      );
    });
  }, [scheme.journals, search, tierFilter, domainFilter]);

  // Reset paging whenever the filter set changes. Uses the
  // previous-prop-comparison-during-render idiom rather than a
  // useEffect+setState (React 19 lints that pattern).
  const filterSig = `${search} ${tierFilter} ${domainFilter}`;
  const [prevFilterSig, setPrevFilterSig] = useState(filterSig);
  if (prevFilterSig !== filterSig) {
    setPrevFilterSig(filterSig);
    setPage(0);
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filtered.length / JOURNALS_PAGE_SIZE),
  );
  const pageRows = filtered.slice(
    page * JOURNALS_PAGE_SIZE,
    (page + 1) * JOURNALS_PAGE_SIZE,
  );

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center gap-2'>
        <input
          type='text'
          placeholder='Search by name or ISSN…'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className='flex-1 min-w-[200px] px-3 py-1.5 border border-app rounded-lg text-sm'
        />
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className='px-2 py-1.5 border border-app rounded-lg text-sm'
        >
          <option value=''>All tiers</option>
          {scheme.tiers.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label || t.key}
            </option>
          ))}
        </select>
        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className='px-2 py-1.5 border border-app rounded-lg text-sm'
        >
          <option value=''>All domains</option>
          {scheme.domains.map((d) => (
            <option key={d.key} value={d.key}>
              {d.label || d.key}
            </option>
          ))}
        </select>
        {editable && (
          <button
            onClick={() => setShowAdd((s) => !s)}
            className='inline-flex items-center gap-1 px-3 py-1.5 button-primary rounded-lg text-sm'
          >
            <Plus size={14} />
            Add journal
          </button>
        )}
      </div>

      {showAdd && editable && (
        <AddJournalRow
          scheme={scheme}
          onAdd={(j) => {
            update((d) => {
              if (d.journals.some((x) => x.issn === j.issn)) return; // dedupe
              d.journals.push(j);
            });
            setShowAdd(false);
          }}
          onCancel={() => setShowAdd(false)}
        />
      )}

      {/* The header and each row share an identical grid template so the
          column widths line up. We deliberately use fixed widths for the
          Tier / Domain / Action columns — `auto` doesn't work here because
          each row is its own grid, so a wide select in one row wouldn't
          push the header's "Tier" label out to match. */}
      <div className='border border-app rounded-lg overflow-hidden'>
        <div className='grid grid-cols-[minmax(0,1fr)_7rem_12rem_2.5rem] gap-3 px-3 py-2 surface-subtle text-[11px] uppercase tracking-wider text-app-soft border-b border-app'>
          <div>Journal</div>
          <div>Tier</div>
          <div>Domain</div>
          <div></div>
        </div>
        {pageRows.length === 0 ? (
          <div className='px-3 py-6 text-center text-sm text-app-soft'>
            No journals match these filters.
          </div>
        ) : (
          pageRows.map((j) => (
            <JournalRow
              key={j.issn}
              journal={j}
              tiers={scheme.tiers}
              domains={scheme.domains}
              editable={editable}
              onPatch={(patch) =>
                update((d) => {
                  const idx = d.journals.findIndex((x) => x.issn === j.issn);
                  if (idx < 0) return;
                  d.journals[idx] = { ...d.journals[idx], ...patch };
                })
              }
              onDelete={() =>
                update((d) => {
                  d.journals = d.journals.filter((x) => x.issn !== j.issn);
                })
              }
            />
          ))
        )}
      </div>

      <div className='flex items-center justify-between text-xs text-app-soft'>
        <span>
          Showing {pageRows.length === 0 ? 0 : page * JOURNALS_PAGE_SIZE + 1}–
          {Math.min(filtered.length, (page + 1) * JOURNALS_PAGE_SIZE)} of{' '}
          {filtered.length.toLocaleString()}
        </span>
        <div className='flex items-center gap-1'>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className='px-2 py-1 button-secondary rounded text-xs disabled:opacity-40'
          >
            Prev
          </button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className='px-2 py-1 button-secondary rounded text-xs disabled:opacity-40'
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function JournalRow({
  journal,
  tiers,
  domains,
  editable,
  onPatch,
  onDelete,
}: {
  journal: Journal;
  tiers: RankingTier[];
  domains: RankingDomain[];
  editable: boolean;
  onPatch: (patch: Partial<Journal>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(journal.name);
  // Sync the local edit draft if the underlying journal name changes
  // externally (e.g. parent updated, import). Previous-prop-comparison
  // idiom — no useEffect setState.
  const [prevName, setPrevName] = useState(journal.name);
  if (prevName !== journal.name) {
    setPrevName(journal.name);
    setName(journal.name);
  }
  // Commit name changes on blur — rerendering on every keystroke through
  // the parent's `update` would clone the whole 1500-row dataset for each
  // key.
  const commitName = () => {
    if (name !== journal.name) onPatch({ name });
  };

  return (
    <div className='grid grid-cols-[minmax(0,1fr)_7rem_12rem_2.5rem] gap-3 items-center px-3 py-2 border-b border-app last:border-b-0 text-sm'>
      <div className='min-w-0'>
        {editable ? (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            className='w-full px-2 py-1 border border-app rounded text-sm'
          />
        ) : (
          <span className='block truncate text-app font-medium'>
            {journal.name}
          </span>
        )}
        <span className='text-[11px] text-app-soft'>ISSN {journal.issn}</span>
      </div>
      <select
        value={journal.tier}
        disabled={!editable}
        onChange={(e) => onPatch({ tier: e.target.value })}
        className='w-full px-2 py-1 border border-app rounded text-xs disabled:opacity-60'
      >
        {!tiers.some((t) => t.key === journal.tier) && (
          <option value={journal.tier}>{journal.tier} (unknown)</option>
        )}
        {tiers.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label || t.key}
          </option>
        ))}
      </select>
      <select
        value={journal.domain}
        disabled={!editable}
        onChange={(e) => onPatch({ domain: e.target.value })}
        className='w-full px-2 py-1 border border-app rounded text-xs disabled:opacity-60'
      >
        {!domains.some((d) => d.key === journal.domain) && (
          <option value={journal.domain}>{journal.domain} (unknown)</option>
        )}
        {domains.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label || d.key}
          </option>
        ))}
      </select>
      <div className='flex items-center gap-1 justify-end'>
        {editable && (
          <button
            onClick={onDelete}
            className='p-1 text-app-soft hover:text-danger'
            title='Delete'
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

function AddJournalRow({
  scheme,
  onAdd,
  onCancel,
}: {
  scheme: RankingScheme;
  onAdd: (j: Journal) => void;
  onCancel: () => void;
}) {
  const [issn, setIssn] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState(scheme.tiers[0]?.key ?? '');
  const [domain, setDomain] = useState(scheme.domains[0]?.key ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const cleanIssn = issn.trim();
    const cleanName = name.trim();
    if (!cleanIssn) return setError('ISSN is required.');
    if (!cleanName) return setError('Name is required.');
    if (!tier || !scheme.tiers.some((t) => t.key === tier))
      return setError('Pick a tier.');
    if (!domain || !scheme.domains.some((d) => d.key === domain))
      return setError('Pick a domain.');
    if (scheme.journals.some((j) => j.issn === cleanIssn))
      return setError('A journal with this ISSN is already in the scheme.');
    onAdd({ issn: cleanIssn, name: cleanName, tier, domain });
    setIssn('');
    setName('');
  };

  return (
    <div className='border border-app rounded-lg p-3 surface-subtle space-y-2'>
      <p className='text-xs font-medium text-app-muted'>Add a journal</p>
      <div className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
        <input
          value={issn}
          onChange={(e) => setIssn(e.target.value)}
          placeholder='ISSN (e.g. 0002-8282)'
          className='px-2 py-1 border border-app rounded text-sm'
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Journal name'
          className='px-2 py-1 border border-app rounded text-sm'
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value)}
          className='px-2 py-1 border border-app rounded text-sm'
        >
          {scheme.tiers.length === 0 && (
            <option value=''>(no tiers — add one first)</option>
          )}
          {scheme.tiers.map((t) => (
            <option key={t.key} value={t.key}>
              Tier: {t.label || t.key}
            </option>
          ))}
        </select>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className='px-2 py-1 border border-app rounded text-sm'
        >
          {scheme.domains.length === 0 && (
            <option value=''>(no domains — add one first)</option>
          )}
          {scheme.domains.map((d) => (
            <option key={d.key} value={d.key}>
              Domain: {d.label || d.key}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <div className='text-danger text-xs flex items-center gap-1'>
          <AlertTriangle size={12} />
          {error}
        </div>
      )}
      <div className='flex items-center justify-end gap-2'>
        <button
          onClick={onCancel}
          className='px-3 py-1 button-secondary rounded text-sm'
        >
          Cancel
        </button>
        <button
          onClick={submit}
          className='px-3 py-1 button-primary rounded text-sm'
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Confirm modal ──────────────────────────────────────────────────────

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmTone,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmTone: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className='fixed inset-0 overlay-soft flex items-center justify-center z-50 p-4'>
      <div className='surface-card border border-app rounded-lg shadow-lg p-5 max-w-md w-full space-y-3'>
        <h3 className='text-base font-semibold text-stone-900'>{title}</h3>
        <div className='text-sm text-app-muted'>{body}</div>
        <div className='flex items-center justify-end gap-2 pt-2'>
          <button
            onClick={onCancel}
            className='px-3 py-1.5 button-secondary rounded-lg text-sm'
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              confirmTone === 'danger'
                ? 'bg-[var(--danger-bg)] text-[var(--danger-foreground)] border border-[var(--danger-border)]'
                : 'button-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
