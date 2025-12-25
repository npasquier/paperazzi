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
        <h1 className='text-3xl md:text-4xl font-bold'>
          About <span className='text-blue-700'>Paper</span>azzi
        </h1>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>Objective</h2>
          <p className='text-slate-700 leading-relaxed'>
            Paperazzi helps researchers uncover influential papers in the
            economics literature. It provides a <i>simple filter by journals</i>{' '}
            and allows <i>navigating forward and backward citations</i>.
          </p>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>How it works</h2>
          <ul className='list-decimal list-inside space-y-2 text-slate-700'>
            <li>Type some keywords to search in titles and abstracts.</li>
            <li>
              Filter by journals using the last categorization by the CNRS. You
              can also add authors or years.
            </li>
            <li>
              Click <button className='text-blue-700'>Search</button>. Several
              results appear (with DOI and PDF whenever available). Click on a
              paper to access its page information.
            </li>
            <li>
              You can then click on forward or backward citations:
              <ul className='list-disc list-inside ml-4 mt-1'>
                <li>Backward citations: the current papers it builds upon.</li>
                <li>Forward citations: the papers that build upon it.</li>
              </ul>
            </li>
          </ul>
          <p className='text-slate-700 mt-4 italic'>
            Data is sourced from <a href='https://openalex.org/'>OpenAlex</a>, a
            comprehensive open database of academic papers.
          </p>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>
            How <span className='text-blue-700'>Paper</span>azzi Differs from
            Google Scholar
          </h2>

          <p className='text-slate-700 mb-4'>
            Google Scholar is excellent for broad discovery (recall), but it
            often returns many loosely related results (noise).
            <br />
            Paperazzi trades recall for relevance and gives you more control
            over what you are actually searching.
          </p>

          <div className='grid md:grid-cols-2 gap-6'>
            <div>
              <h3 className='font-semibold mb-1'>Similarities</h3>
              <ul className='list-disc list-inside text-slate-700'>
                <li>Keyword-based search.</li>
                <li>Journal filtering (a pain in the ass with Scholar).</li>
                <li>Navigation through forward citations.</li>
              </ul>
            </div>

            <div>
              <h3 className='font-semibold mb-1'>Differences</h3>
              <ul className='list-disc list-inside text-slate-700 space-y-1'>
                <li>
                  Queries run only on titles and abstracts. Scholar also run on
                  available PDFs.
                </li>
                <li>
                  Journal filter builds on CNRS categorization to choose
                  journals and then filter using their ISSN. Scholar instead
                  asks for journal names in an advanced search (I dare you to
                  find it) and uses journal names to filter (high risk of
                  inconsistency). For example,{' '}
                  <Link
                    href='https://scholar-filter.vercel.app/'
                    className='py-2 font-semibold hover:bg-gray-50'
                    target='_blank'
                  >
                    scholar-filter.vercel.app
                  </Link>{' '}
                  shows this beautifully.
                </li>
                <li>
                  Explore both backward and forward citations. Scholar only
                  allows forward citations.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
