'use client';

/**
 * The "Get started" landing screen rendered by SearchResults when the user
 * has no active query, filter, citation drill-down, or network selection.
 * Three preset tiles seed concrete starting points; the parent
 * (PaperazziApp) wires the click handlers to URL params + transient state.
 *
 * Extracted from SearchResults.tsx to keep that file focused on the
 * results-list and network-view rendering. Behavior is unchanged.
 */
export type PresetTileId = 'climate-top5' | 'demo-network' | 'recent-qje';

interface EmptyStateProps {
  onPresetTile?: (preset: PresetTileId) => void;
}

export default function EmptyState({ onPresetTile }: EmptyStateProps) {
  return (
    <div className='py-8'>
      <h2 className='text-lg font-semibold text-stone-800 mb-1'>Get started</h2>
      <p className='text-sm text-stone-500 mb-6'>
        Pick a use case example, or type a query in the navbar.
      </p>
      <div className='grid gap-3 md:grid-cols-3'>
        <button
          onClick={() => onPresetTile?.('climate-top5')}
          className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
        >
          <h3 className='text-sm font-medium text-stone-900 mb-1'>
            Search &ldquo;climate change&rdquo; in&nbsp;Top&nbsp;5
          </h3>
          <p className='text-xs text-stone-500 leading-relaxed'>
            Search for &ldquo;climate change&rdquo; across the Top 5 econ
            journals (AER, Econometrica, JPE, QJE, REStud), ranked by
            relevance.
          </p>
        </button>
        <button
          onClick={() => onPresetTile?.('demo-network')}
          className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
        >
          <h3 className='text-sm font-medium text-stone-900 mb-1'>
            Explore a citation network
          </h3>
          <p className='text-xs text-stone-500 leading-relaxed'>
            See how a single paper&apos;s references and citing papers cluster
            on year × log-citations axes. Click any node to trace a path.
          </p>
        </button>
        <button
          onClick={() => onPresetTile?.('recent-qje')}
          className='surface-card border border-app rounded-lg p-4 text-left hover:bg-stone-50 transition'
        >
          <h3 className='text-sm font-medium text-stone-900 mb-1'>
            Browse recent papers in QJE
          </h3>
          <p className='text-xs text-stone-500 leading-relaxed'>
            Switches to Specific mode + Most Recent sort. Save it as a journal
            filter to track monthly.
          </p>
        </button>
      </div>
      <p className='text-xs text-stone-400 mt-6'>
        New here?{' '}
        <a
          href='/help'
          className='text-stone-500 hover:text-stone-700 underline underline-offset-2'
        >
          See the Help page
        </a>{' '}
        for a full walkthrough.
      </p>
    </div>
  );
}
