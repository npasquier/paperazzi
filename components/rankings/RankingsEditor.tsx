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
//   3. Module split (2026-06 L2 decomposition): this file is the
//      orchestrator — state, the `update` mutation primitive, and the
//      import/export/fork/reset flows. The UI lives in sibling files:
//      Header, ImportPanel, FormatHelp, Tabs, InfoTab, JournalsTab,
//      TierDomainTabs (both thin wrappers over KeyedListEditor), and
//      ConfirmModal.
//
// Import/export use the same JSON shape as `RankingScheme` (the type
// itself). The validator in `utils/activeRanking.ts` is the gatekeeper —
// nothing reaches localStorage that didn't pass it.

'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { RankingScheme } from '@/types/interfaces';
import {
  hasUserOverride,
  loadActiveRanking,
  saveActiveRanking,
  useActiveRanking,
  validateRankingScheme,
} from '@/utils/activeRanking';
import { triggerDownload } from '@/utils/download';
import ConfirmModal from './ConfirmModal';
import Header from './Header';
import ImportPanel from './ImportPanel';
import FormatHelp from './FormatHelp';
import Tabs from './Tabs';
import InfoTab from './InfoTab';
import JournalsTab from './JournalsTab';
import { TiersTab, DomainsTab } from './TierDomainTabs';
import type { TabId } from './types';

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
    triggerDownload(
      JSON.stringify(active, null, 2),
      `${active.id || 'ranking'}.json`,
      'application/json',
    );
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
