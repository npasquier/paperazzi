'use client';

// Set-up panel + dropzone. Split out of RankingsEditor.tsx (2026-06 L2
// decomposition).
//
// Three workflows live on the rankings page — editing the current
// ranking, loading a community-shared one, or building one from a
// published list. The panel names all three side by side so the user
// understands their options up front, then presents the dropzone as
// the common landing pad for paths (2) and (3). Path (1) is just a
// pointer to the editor controls above it.

import { DragEvent, useCallback, useState } from 'react';
import {
  Upload,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink as ExternalLinkIcon,
} from 'lucide-react';

interface ImportPanelProps {
  onFile: (file: File) => void;
  importError: string | null;
  clearError: () => void;
}

export default function ImportPanel({
  onFile,
  importError,
  clearError,
}: ImportPanelProps) {
  // Default open so first-time visitors see the three workflows.
  // Once the user knows the lay of the land they can collapse the
  // whole panel via the chevron in the header — the dropzone is
  // hidden too, since the user has presumably already imported once.
  // An import error force-opens the panel so the message is visible.
  const [open, setOpen] = useState(true);
  const expanded = open || importError !== null;

  return (
    <div className='surface-card border border-app rounded-lg p-4 space-y-4'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='w-full flex items-start justify-between gap-3 text-left'
        aria-expanded={expanded}
        aria-controls='import-panel-body'
      >
        <div>
          <h2 className='text-sm font-semibold text-stone-900'>
            Set up your ranking
          </h2>
          <p className='text-xs text-app-muted mt-1'>
            Three ways to land on the right list — pick whichever fits how you
            already keep track of journals.
          </p>
        </div>
        <span
          className='flex-shrink-0 text-app-soft hover:text-app transition mt-0.5'
          aria-hidden='true'
        >
          {expanded ? (
            <ChevronDown size={16} />
          ) : (
            <ChevronRight size={16} />
          )}
        </span>
      </button>

      {expanded && (
        <div id='import-panel-body' className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <WorkflowCard
              number={1}
              title='Edit the current ranking'
              body={
                <>
                  Click <strong>Fork to edit</strong> above to start
                  customising the built-in CNRS scheme — rename tiers, add
                  domains, edit per-journal assignments in the tabs below.{' '}
                  <em>Reset to default</em> always brings the baseline back.
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
                  Most discipline-specific rankings circulate as PDFs.
                  Convert one to the JSON shape below (the editor accepts
                  it), drop the file here, and you&apos;re done.
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
              <button
                onClick={clearError}
                className='text-app-soft hover:text-app'
              >
                <X size={14} />
              </button>
            </div>
          )}
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

/** The drag-and-drop tile. The explanatory copy lives in the workflow
 *  cards above, so this is just the action. */
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
