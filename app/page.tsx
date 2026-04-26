import type { Metadata } from 'next';
import Link from 'next/link';
import { Filter, Pin, ArrowRight, Laptop } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Paperazzi',
  description: 'Track star papers in economics literature',
};

export default function Page() {
  return (
    <main className='min-h-full surface-app flex flex-col items-center justify-center px-6'>
      {/* Tagline */}
      <p className='text-stone-400 text-sm mb-4'>For economics researchers</p>

      {/* Main headline */}
      <h1 className='text-3xl md:text-4xl font-semibold text-stone-900 text-center mb-4 max-w-xl'>
        Find papers that matter
      </h1>

      {/* Subtext */}
      <p className='text-stone-500 text-center max-w-md mb-12'>
        Filter by journals. Trace citations. Pin important papers.
      </p>

      {/* Visual preview of the app layout */}
      <div className='w-full max-w-2xl mb-12'>
        <div className='surface-panel border border-app rounded-xl overflow-hidden'>
          {/* Mock navbar */}
          <div className='h-10 surface-card border-b border-app flex items-center px-4'>
            <div className='w-20 h-2 surface-subtle rounded' />
            <div className='flex-1 mx-8'>
              <div className='max-w-xs mx-auto h-6 surface-muted rounded border border-app' />
            </div>
            <div className='w-16 h-2 surface-subtle rounded' />
          </div>

          {/* Mock content */}
          <div className='flex h-48'>
            {/* Left panel - Filters */}
            <div className='w-1/4 surface-card border-r border-app p-3'>
              <div className='flex items-center gap-1.5 mb-3'>
                <Filter size={12} className='text-stone-400' />
                <span className='text-xs text-stone-500'>Filters</span>
              </div>
              <div className='space-y-2'>
                <div className='h-2 surface-muted rounded w-full' />
                <div className='h-2 surface-muted rounded w-3/4' />
                <div className='h-2 surface-muted rounded w-5/6' />
              </div>
            </div>

            {/* Center - Results */}
            <div className='flex-1 p-3'>
              <div className='space-y-2'>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className='h-10 surface-card border border-app rounded-lg'
                  />
                ))}
              </div>
            </div>

            {/* Right panel - Pinned */}
            <div className='w-1/4 surface-card border-l border-app p-3'>
              <div className='flex items-center gap-1.5 mb-3'>
                <Pin size={12} className='text-warning' />
                <span className='text-xs text-stone-500'>Pinned</span>
              </div>
              <div className='space-y-2'>
                <div className='h-8 banner-warning rounded' />
                <div className='h-8 surface-muted border border-dashed border-app rounded' />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <Link
        href='/search'
        className='inline-flex items-center gap-2 text-stone-900 hover:text-stone-600 transition group mb-16'
      >
        <span className='border-b border-[var(--foreground)] group-hover:border-[var(--foreground-muted)] pb-0.5'>
          Start searching
        </span>
        <ArrowRight
          size={16}
          className='group-hover:translate-x-0.5 transition-transform'
        />
      </Link>

      {/* Device note */}
      <p className='text-xs text-stone-400 flex items-center gap-1.5'>
        <Laptop size={14} />
        Optimized for laptops — give your phone a break
      </p>
    </main>
  );
}
