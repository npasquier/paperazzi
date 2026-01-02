'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Check,
  Loader2,
} from 'lucide-react';
import { Topic } from '@/types/interfaces';

interface TopicModalProps {
  isOpen: boolean;
  selectedTopics: Topic[];
  onClose: () => void;
  onApply: (topics: Topic[]) => void;
}

interface TopicResult {
  id: string;
  display_name: string;
  works_count: number;
  subfield: { id: string; display_name: string };
  field: { id: string; display_name: string };
  domain: { id: string; display_name: string };
}

interface SubfieldResult {
  id: string;
  display_name: string;
  works_count: number;
  field: { id: string; display_name: string };
}

// Economics, Econometrics and Finance subfields
const ECONOMICS_SUBFIELDS = [
  {
    id: 'https://openalex.org/subfields/2002',
    name: 'Economics and Econometrics',
    description: 'Microeconomics, macroeconomics, econometric methods',
  },
  {
    id: 'https://openalex.org/subfields/2003',
    name: 'Finance',
    description: 'Corporate finance, investments, financial markets',
  },
];

export default function TopicModal({
  isOpen,
  selectedTopics,
  onClose,
  onApply,
}: TopicModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TopicResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Topic[]>(selectedTopics);
  const [expandedSubfields, setExpandedSubfields] = useState<string[]>([]);
  const [subfieldTopics, setSubfieldTopics] = useState<
    Record<string, TopicResult[]>
  >({});
  const [loadingSubfield, setLoadingSubfield] = useState<string | null>(null);

  // Reset selected when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelected(selectedTopics);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, selectedTopics]);

  // Search topics (limited to economics field)
  const searchTopics = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // Search within Economics, Econometrics and Finance field (field.id: 20)
      const res = await fetch(
        `https://api.openalex.org/topics?search=${encodeURIComponent(
          query
        )}&filter=field.id:20&per-page=25&sort=works_count:desc`
      );
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Failed to search topics:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      searchTopics(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchTopics]);

  // Load topics for a subfield
  const loadSubfieldTopics = async (subfieldId: string) => {
    if (subfieldTopics[subfieldId]) {
      setExpandedSubfields((prev) =>
        prev.includes(subfieldId)
          ? prev.filter((f) => f !== subfieldId)
          : [...prev, subfieldId]
      );
      return;
    }

    setLoadingSubfield(subfieldId);
    try {
      const shortId = subfieldId.replace('https://openalex.org/subfields/', '');
      const res = await fetch(
        `https://api.openalex.org/topics?filter=subfield.id:${shortId}&per-page=50&sort=works_count:desc`
      );
      const data = await res.json();
      setSubfieldTopics((prev) => ({
        ...prev,
        [subfieldId]: data.results || [],
      }));
      setExpandedSubfields((prev) => [...prev, subfieldId]);
    } catch (error) {
      console.error('Failed to load subfield topics:', error);
    } finally {
      setLoadingSubfield(null);
    }
  };

  const toggleTopic = (topic: TopicResult) => {
    const topicData: Topic = {
      id: topic.id,
      display_name: topic.display_name,
      subfield: topic.subfield,
      field: topic.field,
      domain: topic.domain,
    };

    setSelected((prev) => {
      const exists = prev.some((t) => t.id === topic.id);
      if (exists) {
        return prev.filter((t) => t.id !== topic.id);
      }
      return [...prev, topicData];
    });
  };

  const isSelected = (topicId: string) =>
    selected.some((t) => t.id === topicId);

  const handleApply = () => {
    onApply(selected);
    onClose();
  };

  // Select all topics from a subfield
  const selectAllFromSubfield = (subfieldId: string) => {
    const topics = subfieldTopics[subfieldId];
    if (!topics) return;

    setSelected((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const newTopics = topics
        .filter((t) => !existingIds.has(t.id))
        .map((topic) => ({
          id: topic.id,
          display_name: topic.display_name,
          subfield: topic.subfield,
          field: topic.field,
          domain: topic.domain,
        }));
      return [...prev, ...newTopics];
    });
  };

  // Deselect all topics from a subfield
  const deselectAllFromSubfield = (subfieldId: string) => {
    const topics = subfieldTopics[subfieldId];
    if (!topics) return;

    const topicIds = new Set(topics.map((t) => t.id));
    setSelected((prev) => prev.filter((t) => !topicIds.has(t.id)));
  };

  // Check if all topics from a subfield are selected
  const areAllSelectedFromSubfield = (subfieldId: string) => {
    const topics = subfieldTopics[subfieldId];
    if (!topics || topics.length === 0) return false;
    return topics.every((t) => isSelected(t.id));
  };

  // Check if some topics from a subfield are selected
  const areSomeSelectedFromSubfield = (subfieldId: string) => {
    const topics = subfieldTopics[subfieldId];
    if (!topics || topics.length === 0) return false;
    return (
      topics.some((t) => isSelected(t.id)) &&
      !areAllSelectedFromSubfield(subfieldId)
    );
  };

  if (!isOpen) return null;

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40'>
      <div className='bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col'>
        {/* Header */}
        <div className='flex items-center justify-between p-4 border-b border-stone-200'>
          <div>
            <h2 className='text-lg font-semibold text-stone-900'>
              Select Economics Topics
            </h2>
            <p className='text-xs text-stone-500 mt-0.5'>
              Browse or search topics within Economics, Econometrics & Finance
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-stone-100 rounded transition'
          >
            <X size={20} className='text-stone-500' />
          </button>
        </div>

        {/* Search */}
        <div className='p-4 border-b border-stone-200'>
          <div className='relative'>
            <Search
              size={18}
              className='absolute left-3 top-1/2 -translate-y-1/2 text-stone-400'
            />
            <input
              type='text'
              placeholder='Search economics topics (e.g., monetary policy, labor market...)'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className='w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 text-sm'
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className='flex-1 overflow-y-auto p-4'>
          {/* Search Results */}
          {searchQuery && (
            <div className='mb-6'>
              <h3 className='text-sm font-medium text-stone-700 mb-2'>
                Search Results
              </h3>
              {isSearching ? (
                <div className='flex items-center justify-center py-4'>
                  <Loader2 className='animate-spin text-stone-400' size={20} />
                </div>
              ) : searchResults.length === 0 ? (
                <p className='text-sm text-stone-500 py-2'>
                  No economics topics found for &quot;{searchQuery}&quot;
                </p>
              ) : (
                <div className='space-y-1'>
                  {searchResults.map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => toggleTopic(topic)}
                      className={`w-full text-left p-2 rounded-lg transition flex items-start gap-2 ${
                        isSelected(topic.id)
                          ? 'bg-stone-100 ring-1 ring-stone-300'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 ${
                          isSelected(topic.id)
                            ? 'bg-stone-800 border-stone-800'
                            : 'border-stone-300'
                        }`}
                      >
                        {isSelected(topic.id) && (
                          <Check size={14} className='text-white' />
                        )}
                      </div>
                      <div className='flex-1 min-w-0'>
                        <p className='text-sm font-medium text-stone-900'>
                          {topic.display_name}
                        </p>
                        <p className='text-xs text-stone-500 truncate'>
                          {topic.subfield?.display_name}
                        </p>
                        <p className='text-xs text-stone-400'>
                          {topic.works_count?.toLocaleString()} works
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Browse by Subfield */}
          {!searchQuery && (
            <div>
              <h3 className='text-sm font-medium text-stone-700 mb-3'>
                Browse by Subfield
              </h3>
              <div className='space-y-2'>
                {ECONOMICS_SUBFIELDS.map((subfield) => (
                  <div
                    key={subfield.id}
                    className='border border-stone-200 rounded-lg overflow-hidden'
                  >
                    <button
                      onClick={() => loadSubfieldTopics(subfield.id)}
                      className='w-full flex items-center gap-3 p-3 hover:bg-stone-50 transition'
                    >
                      {loadingSubfield === subfield.id ? (
                        <Loader2
                          size={16}
                          className='animate-spin text-stone-400'
                        />
                      ) : expandedSubfields.includes(subfield.id) ? (
                        <ChevronDown size={16} className='text-stone-400' />
                      ) : (
                        <ChevronRight size={16} className='text-stone-400' />
                      )}
                      <div className='flex-1 text-left'>
                        <span className='text-sm font-semibold text-stone-800'>
                          {subfield.name}
                        </span>
                        <p className='text-xs text-stone-500'>
                          {subfield.description}
                        </p>
                      </div>
                      {subfieldTopics[subfield.id] && (
                        <span className='text-xs text-stone-400'>
                          {subfieldTopics[subfield.id].length} topics
                        </span>
                      )}
                    </button>

                    {/* Subfield Topics */}
                    {expandedSubfields.includes(subfield.id) &&
                      subfieldTopics[subfield.id] && (
                        <div className='border-t border-stone-200 bg-stone-50'>
                          {/* Select All / Deselect All */}
                          <div className='px-3 py-2 border-b border-stone-200 flex items-center justify-between'>
                            <span className='text-xs text-stone-600'>
                              {
                                subfieldTopics[subfield.id].filter((t) =>
                                  isSelected(t.id)
                                ).length
                              }{' '}
                              of {subfieldTopics[subfield.id].length} selected
                            </span>
                            <div className='flex gap-2'>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllFromSubfield(subfield.id);
                                }}
                                className='text-xs text-blue-600 hover:text-blue-800 font-medium'
                              >
                                Select all
                              </button>
                              <span className='text-stone-300'>|</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deselectAllFromSubfield(subfield.id);
                                }}
                                className='text-xs text-stone-600 hover:text-stone-800 font-medium'
                              >
                                Clear
                              </button>
                            </div>
                          </div>

                          <div className='max-h-64 overflow-y-auto p-2 space-y-1'>
                            {subfieldTopics[subfield.id].map((topic) => (
                              <button
                                key={topic.id}
                                onClick={() => toggleTopic(topic)}
                                className={`w-full text-left p-2 rounded-lg transition flex items-start gap-2 ${
                                  isSelected(topic.id)
                                    ? 'bg-white ring-1 ring-stone-300'
                                    : 'hover:bg-white'
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 ${
                                    isSelected(topic.id)
                                      ? 'bg-stone-800 border-stone-800'
                                      : 'border-stone-300'
                                  }`}
                                >
                                  {isSelected(topic.id) && (
                                    <Check size={12} className='text-white' />
                                  )}
                                </div>
                                <div className='flex-1 min-w-0'>
                                  <p className='text-sm text-stone-900'>
                                    {topic.display_name}
                                  </p>
                                  <p className='text-xs text-stone-400'>
                                    {topic.works_count?.toLocaleString()} works
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className='p-4 border-t border-stone-200 bg-stone-50'>
          {selected.length > 0 && (
            <div className='mb-3'>
              <div className='flex items-center justify-between mb-2'>
                <span className='text-xs font-medium text-stone-600'>
                  Selected topics:
                </span>
                <button
                  onClick={() => setSelected([])}
                  className='text-xs text-stone-500 hover:text-stone-700'
                >
                  Clear all
                </button>
              </div>
              <div className='flex flex-wrap gap-1 max-h-20 overflow-y-auto'>
                {selected.map((topic) => (
                  <span
                    key={topic.id}
                    className='inline-flex items-center gap-1 px-2 py-1 bg-stone-200 text-stone-700 rounded text-xs'
                  >
                    {topic.display_name}
                    <button
                      onClick={() =>
                        setSelected((prev) =>
                          prev.filter((t) => t.id !== topic.id)
                        )
                      }
                      className='hover:text-stone-900'
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className='flex items-center justify-between'>
            <span className='text-sm text-stone-600'>
              {selected.length} topic{selected.length !== 1 ? 's' : ''} selected
            </span>
            <div className='flex gap-2'>
              <button
                onClick={onClose}
                className='px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded-lg transition'
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className='px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition'
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
