'use client';

// Journals tab: the filtered + paginated journal table with inline
// editing and the add-journal form. Split out of RankingsEditor.tsx
// (2026-06 L2 decomposition). Client-side filtering/paging rather than
// virtualisation — plenty fast at the ~1.5k–5k row scale we're at.

import { useMemo, useState } from 'react';
import { Plus, X, AlertTriangle } from 'lucide-react';
import type {
  Journal,
  RankingDomain,
  RankingScheme,
  RankingTier,
} from '@/types/interfaces';
import type { UpdateScheme } from './types';

const JOURNALS_PAGE_SIZE = 50;

export default function JournalsTab({
  scheme,
  editable,
  update,
}: {
  scheme: RankingScheme;
  editable: boolean;
  update: UpdateScheme;
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
  const filterSig = `${search}\u0000${tierFilter}\u0000${domainFilter}`;
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
