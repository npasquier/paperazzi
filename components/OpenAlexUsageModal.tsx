'use client';

import { useEffect, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Soft semantic color scale (your original spirit, toned down)
 */
function getUsageColor(p: number) {
  if (p < 50) return '#0f766e'; // teal safe
  if (p < 75) return '#2563eb'; // blue caution
  if (p < 90) return '#8a5a0a'; // amber warning
  return '#a04333'; // red danger
}

export default function OpenAlexUsageModal({ isOpen, onClose }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch('/api/openalex/usage', { cache: 'no-store' });
    const json = await res.json();
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, [isOpen]);

  if (!isOpen || !data) return null;

  const keys = data.keys.filter((k: any) => k.rateLimit);

  const worstKey = Math.max(...keys.map((k: any) => k.rateLimit.usedPercent));

  const globalPercent =
    (data.summary.totalUsedUsd /
      (data.summary.totalUsedUsd + data.summary.totalRemainingUsd)) *
    100;

  return (
    <div
      className='fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50'
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className='w-full max-w-2xl bg-neutral-900 text-white rounded-2xl shadow-2xl px-8 py-6'
      >
        {/* Header */}
        <div className='flex items-center justify-between mb-5'>
          <div className='text-sm text-neutral-400'>OpenAlex API usage</div>
          <div className='flex items-center gap-3'>
            <button
              onClick={load}
              className='p-2 hover:bg-neutral-800 rounded-lg'
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className='p-2 hover:bg-neutral-800 rounded-lg'
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Global */}
        <div className='space-y-3'>
          <div className='flex justify-between text-sm text-neutral-300'>
            <span>Global quota</span>
            <span>{globalPercent.toFixed(2)}%</span>
          </div>

          <div className='h-2 bg-neutral-800 rounded-full overflow-hidden'>
            <div
              className='h-full'
              style={{
                width: `${globalPercent}%`,
                backgroundColor: getUsageColor(globalPercent),
              }}
            />
          </div>
        </div>
        <div className='flex justify-between text-xs text-neutral-500 mt-6 pt-4 border-t border-neutral-800'>
          <div> ${data.summary.totalUsedUsd.toFixed(2)} used</div>
          <div>${data.summary.totalRemainingUsd.toFixed(2)} left</div>
        </div>

        {/* Per-key */}
        <div className='mt-6 space-y-3'>
          {keys.map((key: any) => {
            const p = key.rateLimit.usedPercent;
            const color = getUsageColor(p);

            return (
              <div key={key.id}>
                <div className='flex justify-between text-xs text-neutral-400 mb-1'>
                  <span className='truncate'>{key.label}</span>
                  <span>{p.toFixed(2)}%</span>
                </div>

                <div className='h-1.5 bg-neutral-800 rounded-full overflow-hidden'>
                  <div
                    className='h-full'
                    style={{
                      width: `${p}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className='flex justify-between text-xs text-neutral-500 mt-6 pt-4 border-t border-neutral-800'>
          <div>
            Reset at{' '}
            {new Date(data.summary.resetsAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
