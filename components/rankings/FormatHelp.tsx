'use client';

// Collapsible JSON-format reference. Split out of RankingsEditor.tsx
// (2026-06 L2 decomposition).
//
// A compact summary of the JSON shape, expandable on demand. The /help
// page carries the full doc — this is the at-a-glance reminder for users
// authoring or editing a scheme by hand. Click to expand.

import { useState } from 'react';
import { Info, ChevronDown, ChevronRight } from 'lucide-react';

export default function FormatHelp() {
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
