'use client';

import { useState } from 'react';
import { Filters } from '../types/interfaces';
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Filter,
  X,
  Plus,
} from 'lucide-react';

interface FilterPanelProps {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  openJournalModal: () => void;
  openAuthorModal: () => void;
  openTopicModal: () => void;
  openInstitutionModal: () => void;
  onSortChange?: (sortBy: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const PUBLICATION_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'article', label: 'Journal Article' },
  { value: 'review', label: 'Review' },
  { value: 'preprint', label: 'Preprint' },
  { value: 'book-chapter', label: 'Book Chapter' },
  { value: 'book', label: 'Book' },
  { value: 'dissertation', label: 'Dissertation' },
  { value: 'dataset', label: 'Dataset' },
];

export default function FilterPanel({
  filters,
  setFilters,
  openJournalModal,
  openAuthorModal,
  openTopicModal,
  openInstitutionModal,
  onSortChange,
  isOpen,
  onToggle,
}: FilterPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['topics', 'journals']) // Default expanded
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const removeJournal = (issn: string) => {
    setFilters((prev) => ({
      ...prev,
      journals: prev.journals.filter((j) => j.issn !== issn),
    }));
  };

  const removeTopic = (topicId: string) => {
    setFilters((prev) => ({
      ...prev,
      topics: prev.topics.filter((t) => t.id !== topicId),
    }));
  };

  const removeAuthor = (authorId: string) => {
    setFilters((prev) => ({
      ...prev,
      authors: prev.authors.filter((a) => a.id !== authorId),
    }));
  };

  const removeInstitution = (instId: string) => {
    setFilters((prev) => ({
      ...prev,
      institutions: prev.institutions.filter((i) => i.id !== instId),
    }));
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSort = e.target.value;
    setFilters((prev) => ({ ...prev, sortBy: newSort }));
    if (onSortChange) {
      onSortChange(newSort);
    }
  };

  const handlePublicationTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    setFilters((prev) => ({ ...prev, publicationType: e.target.value }));
  };

  const activeFilterCount =
    filters.journals.length +
    filters.authors.length +
    filters.topics.length +
    filters.institutions.length +
    (filters.publicationType ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0);

  // Collapsed panel
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className='fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-white border border-l-0 border-stone-200 rounded-r-lg p-2 shadow-sm hover:bg-stone-50 transition'
        title='Open filters'
      >
        <div className='flex flex-col items-center gap-1'>
          <Filter
            size={18}
            className={
              activeFilterCount > 0 ? 'text-stone-800' : 'text-stone-400'
            }
          />
          {activeFilterCount > 0 && (
            <span className='text-xs font-medium text-stone-600'>
              {activeFilterCount}
            </span>
          )}
        </div>
      </button>
    );
  }

  // Render a badge/pill
  const renderPill = (key: string, label: string, onRemove: () => void) => (
    <span
      key={key}
      className='inline-flex items-center gap-1 px-2 py-1 bg-stone-100 text-stone-700 rounded text-xs group'
    >
      <span className='truncate max-w-[140px]'>{label}</span>
      <button
        onClick={onRemove}
        className='text-stone-400 hover:text-stone-600 transition'
        aria-label={`Remove ${label}`}
      >
        <X size={12} />
      </button>
    </span>
  );

  // Render collapsible section
  const renderSection = (
    id: string,
    label: string,
    count: number,
    onAdd: () => void,
    items: { key: string; label: string; onRemove: () => void }[]
  ) => {
    const isExpanded = expandedSections.has(id);

    return (
      <div className='border-b border-stone-100 last:border-b-0'>
        <button
          onClick={() => toggleSection(id)}
          className='w-full flex items-center justify-between py-3 hover:bg-stone-50 transition'
        >
          <div className='flex items-center gap-2'>
            {isExpanded ? (
              <ChevronDown size={14} className='text-stone-400' />
            ) : (
              <ChevronRight size={14} className='text-stone-400' />
            )}
            <span className='text-sm text-stone-600'>{label}</span>
          </div>
          {count > 0 && (
            <span className='text-xs bg-stone-200 text-stone-600 px-1.5 py-0.5 rounded'>
              {count}
            </span>
          )}
        </button>

        {isExpanded && (
          <div className='pb-3 pl-6'>
            {items.length > 0 && (
              <div className='flex flex-wrap gap-1.5 mb-2'>
                {items.map((item) =>
                  renderPill(item.key, item.label, item.onRemove)
                )}
              </div>
            )}
            <button
              onClick={onAdd}
              className='inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition'
            >
              <Plus size={12} />
              Add
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className='w-64 bg-white border-r border-stone-200 flex flex-col h-full overflow-hidden'>
      {/* Header */}
      <div className='px-4 py-3 border-b border-stone-200 flex-shrink-0'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Filter size={14} className='text-stone-400' />
            <span className='text-sm font-medium text-stone-700'>Filters</span>
            {activeFilterCount > 0 && (
              <span className='text-xs bg-stone-800 text-white px-1.5 py-0.5 rounded'>
                {activeFilterCount}
              </span>
            )}
          </div>
          <button
            onClick={onToggle}
            className='p-1 hover:bg-stone-100 rounded transition'
            title='Close filters'
          >
            <ChevronLeft size={16} className='text-stone-400' />
          </button>
        </div>
      </div>
      {/* Scrollable content */}
      <div className='flex-1 overflow-y-auto'>
        {/* Sort By */}
        <div className='px-4 py-3 border-b border-stone-100'>
          <label className='text-xs text-stone-400 block mb-1.5'>Sort by</label>
          <select
            value={filters.sortBy}
            onChange={handleSortChange}
            className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm bg-white text-stone-700'
          >
            <option value='relevance_score'>Relevance</option>
            <option value='publication_date:desc'>Most Recent</option>
            <option value='cited_by_count:desc'>Most Cited</option>
            <option value='publication_date:asc'>Oldest First</option>
          </select>
        </div>

        {/* Collapsible filter sections */}
        <div className='px-4'>
          {/* Topics */}
          {renderSection(
            'topics',
            'Topics',
            filters.topics.length,
            openTopicModal,
            filters.topics.map((t) => ({
              key: t.id,
              label: t.display_name || 'Unknown Topic',
              onRemove: () => removeTopic(t.id),
            }))
          )}

          {/* Journals */}
          {renderSection(
            'journals',
            'Journals',
            filters.journals.length,
            openJournalModal,
            filters.journals.map((j) => ({
              key: j.issn,
              label: j.name || 'Unknown Journal',
              onRemove: () => removeJournal(j.issn),
            }))
          )}

          {/* Authors */}
          {renderSection(
            'authors',
            'Authors',
            filters.authors.length,
            openAuthorModal,
            filters.authors.map((a) => ({
              key: a.id,
              label: a.name || 'Unknown Author',
              onRemove: () => removeAuthor(a.id),
            }))
          )}

          {/* Institutions */}
          {renderSection(
            'institutions',
            'Institutions',
            filters.institutions.length,
            openInstitutionModal,
            filters.institutions.map((i) => ({
              key: i.id,
              label: i.display_name || 'Unknown Institution',
              onRemove: () => removeInstitution(i.id),
            }))
          )}
        </div>

        {/* Type & Year */}
        <div className='px-4 py-3 border-t border-stone-100 space-y-3'>
          <div>
            <label className='text-xs text-stone-400 block mb-1.5'>Type</label>
            <select
              value={filters.publicationType}
              onChange={handlePublicationTypeChange}
              className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm bg-white text-stone-700'
            >
              {PUBLICATION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className='text-xs text-stone-400 block mb-1.5'>Year</label>
            <div className='flex items-center gap-2'>
              <input
                type='number'
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                }
                placeholder='From'
                className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm'
              />
              <span className='text-stone-300'>–</span>
              <input
                type='number'
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                }
                placeholder='To'
                className='w-full px-2 py-1.5 border border-stone-200 rounded focus:outline-none focus:ring-1 focus:ring-stone-300 text-sm'
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
