import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Paperazzi',
  description: 'Track star papers in economics literature',
};

export default function Page() {
  return (
    <main className='min-h-[calc(100vh-57px)] bg-stone-50 flex items-center'>
      <div className='max-w-4xl mx-auto px-6 py-12'>
        {/* Hero Section */}
        <div className='space-y-6 text-center mb-12'>
          <h1 className='text-4xl md:text-5xl font-bold text-stone-900'>
            Search Top Economics Journals
          </h1>
          
          <p className='text-lg text-stone-600 max-w-2xl mx-auto'>
            Filter by journal rank and explore citation networks. 
            See who cites a paper and who the paper cites.
          </p>

          <div className='pt-4'>
            <Link
              href='/search'
              className='inline-flex items-center gap-2 px-6 py-3 bg-stone-800 text-white font-medium rounded-lg hover:bg-stone-700 transition'
            >
              Start Searching
              <ArrowRight className='w-4 h-4' />
            </Link>
          </div>
        </div>

        {/* Key Features - Side by Side */}
        <div className='grid md:grid-cols-2 gap-8 max-w-3xl mx-auto'>
          <div>
            <h2 className='text-xl font-bold text-stone-900 mb-2'>
              Filter by Journal Rank
            </h2>
            <p className='text-stone-600 text-sm'>
              Select papers from top-tier economics journals. Filter by domain and ranking.
            </p>
          </div>

          <div>
            <h2 className='text-xl font-bold text-stone-900 mb-2'>
              Explore Citation Networks
            </h2>
            <p className='text-stone-600 text-sm'>
              See forward and backward citations. Trace the development of ideas through the literature.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}