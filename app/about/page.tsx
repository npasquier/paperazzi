import Link from 'next/link';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About Paperazzi',
  description:
    'Learn about Paperazzi, a research platform for economics papers',
};

export default function AboutPage() {
  return (
    <main className='min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800 p-6 md:p-12'>
      <div className='max-w-4xl mx-auto space-y-8'>
        <h1 className='text-3xl md:text-4xl font-bold text-blue-600'>
          About Paperazzi
        </h1>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>Objective</h2>
          <p className='text-slate-700 leading-relaxed'>
            Paperazzi helps researchers uncover influential papers in economics.
            It searches **titles and abstracts**, and allows navigating
            **forward and backward citations** for deep exploration.
          </p>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>How it works</h2>
          <ul className='list-disc list-inside space-y-2 text-slate-700'>
            <li>Search keywords in titles and abstracts.</li>
            <li>Filter by journals using CNRS last categorization.</li>
            <li>
              Navigate citations:
              <ul className='list-decimal list-inside ml-4 mt-1'>
                <li>Backward: references cited by the paper</li>
                <li>Forward: papers citing the paper</li>
              </ul>
            </li>
            <li>Access DOI and PDF links when available.</li>
          </ul>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>
            Similarities & Differences with Google Scholar
          </h2>
          <div className='grid md:grid-cols-2 gap-6'>
            <div>
              <h3 className='font-semibold mb-1'>Similarities</h3>
              <ul className='list-disc list-inside text-slate-700'>
                <li>Search using words (accepting authors, years...).</li>
                <li>Complex filtering by  journal.</li>
                <li>Navigate forward citations.</li>
              </ul>
            </div>
            <div>
              <h3 className='font-semibold mb-1'>Differences</h3>
              <ul className='list-disc list-inside text-slate-700'>
                <li>Searches **only title and abstract**.</li>
                <li>Simple journal filter built on **CNRS categorization**.</li>
                <li>Can navigate **forward and backward citations**.</li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
