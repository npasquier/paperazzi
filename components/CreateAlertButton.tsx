'use client';

import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import ExportAlertModal from './ExportAlertModal';
import { Filters } from '@/types/interfaces';

interface CreateAlertButtonProps {
  filters: Filters;
  query: string;
}

export default function CreateAlertButton({ filters, query }: CreateAlertButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [visible, setVisible] = useState(false);

  const hasFilters =
    query ||
    filters.journals.length ||
    filters.authors.length ||
    filters.topics.length ||
    filters.institutions.length ||
    filters.publicationType ||
    filters.dateFrom ||
    filters.dateTo;

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      // 80px invisible activation zone on left side
      setVisible(e.clientX < 80);
    };

    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  if (!hasFilters) return null;

  return (
    <>
      <div
        className={`fixed bottom-4 left-4 z-40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-xl px-3 py-2 shadow-sm text-xs text-stone-600">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 hover:text-stone-800 transition"
          >
            <Bell size={14} />
            <span>Save this search</span>
          </button>

          <button
            onClick={() => setVisible(false)}
            className="text-stone-400 hover:text-stone-700 transition"
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <ExportAlertModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        filters={filters}
        query={query}
      />
    </>
  );
}
