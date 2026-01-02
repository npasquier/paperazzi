'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Search, Check, Loader2, Building2 } from 'lucide-react';
import { Institution } from '@/types/interfaces';

interface InstitutionModalProps {
  isOpen: boolean;
  selectedInstitutions: Institution[];
  onClose: () => void;
  onApply: (institutions: Institution[]) => void;
}

interface InstitutionResult {
  id: string;
  display_name: string;
  country_code: string;
  type: string;
  works_count: number;
  ror: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  GB: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  CA: 'Canada',
  AU: 'Australia',
  NL: 'Netherlands',
  CH: 'Switzerland',
  JP: 'Japan',
  CN: 'China',
  IT: 'Italy',
  ES: 'Spain',
  SE: 'Sweden',
  BE: 'Belgium',
  AT: 'Austria',
  DK: 'Denmark',
  NO: 'Norway',
  FI: 'Finland',
  SG: 'Singapore',
  KR: 'South Korea',
  IL: 'Israel',
  IN: 'India',
  BR: 'Brazil',
};

const INSTITUTION_TYPES: Record<string, string> = {
  education: '🎓 University',
  company: '🏢 Company',
  government: '🏛️ Government',
  nonprofit: '🤝 Nonprofit',
  healthcare: '🏥 Healthcare',
  facility: '🔬 Research Facility',
  other: '📍 Other',
};

export default function InstitutionModal({
  isOpen,
  selectedInstitutions,
  onClose,
  onApply,
}: InstitutionModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<InstitutionResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<Institution[]>(selectedInstitutions);

  useEffect(() => {
    if (isOpen) {
      setSelected(selectedInstitutions);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, selectedInstitutions]);

  const searchInstitutions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://api.openalex.org/institutions?search=${encodeURIComponent(query)}&per-page=20`
      );
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Failed to search institutions:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchInstitutions(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchInstitutions]);

  const toggleInstitution = (inst: InstitutionResult) => {
    const instData: Institution = {
      id: inst.id,
      display_name: inst.display_name,
      country_code: inst.country_code,
      type: inst.type,
      ror: inst.ror,
    };

    setSelected((prev) => {
      const exists = prev.some((i) => i.id === inst.id);
      if (exists) {
        return prev.filter((i) => i.id !== inst.id);
      }
      return [...prev, instData];
    });
  };

  const isSelected = (instId: string) => selected.some((i) => i.id === instId);

  const handleApply = () => {
    onApply(selected);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-900">
            Select Institutions
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-stone-100 rounded transition"
          >
            <X size={20} className="text-stone-500" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-stone-200">
          <div className="relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
            />
            <input
              type="text"
              placeholder="Search institutions (e.g., Harvard, MIT, World Bank...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-stone-400 text-sm"
              autoFocus
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!searchQuery && (
            <div className="text-center py-8 text-stone-500">
              <Building2 size={32} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm">
                Search for universities, research institutions, central banks, or
                organizations
              </p>
            </div>
          )}

          {searchQuery && isSearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-stone-400" size={24} />
            </div>
          )}

          {searchQuery && !isSearching && searchResults.length === 0 && (
            <p className="text-sm text-stone-500 text-center py-8">
              No institutions found for &quot;{searchQuery}&quot;
            </p>
          )}

          {searchQuery && !isSearching && searchResults.length > 0 && (
            <div className="space-y-1">
              {searchResults.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => toggleInstitution(inst)}
                  className={`w-full text-left p-3 rounded-lg transition flex items-start gap-3 ${
                    isSelected(inst.id)
                      ? 'bg-stone-100 ring-1 ring-stone-300'
                      : 'hover:bg-stone-50'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 ${
                      isSelected(inst.id)
                        ? 'bg-stone-800 border-stone-800'
                        : 'border-stone-300'
                    }`}
                  >
                    {isSelected(inst.id) && (
                      <Check size={14} className="text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {inst.display_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-stone-500">
                        {INSTITUTION_TYPES[inst.type] || inst.type}
                      </span>
                      {inst.country_code && (
                        <>
                          <span className="text-stone-300">•</span>
                          <span className="text-xs text-stone-500">
                            {COUNTRY_NAMES[inst.country_code] || inst.country_code}
                          </span>
                        </>
                      )}
                      <span className="text-stone-300">•</span>
                      <span className="text-xs text-stone-400">
                        {inst.works_count?.toLocaleString()} works
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-200 bg-stone-50">
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {selected.map((inst) => (
                <span
                  key={inst.id}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-stone-200 text-stone-700 rounded text-xs"
                >
                  {inst.display_name}
                  <button
                    onClick={() =>
                      setSelected((prev) => prev.filter((i) => i.id !== inst.id))
                    }
                    className="hover:text-stone-900"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-stone-600">
              {selected.length} institution{selected.length !== 1 ? 's' : ''}{' '}
              selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-200 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                className="px-4 py-2 text-sm bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition"
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