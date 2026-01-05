import { BookOpen, Search, Database, Scale, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className='min-h-[calc(100vh-57px)] bg-stone-50'>
      <div className='max-w-3xl mx-auto px-6 py-16'>
        {/* Header */}
        <div className='mb-12'>
          <h1 className='text-2xl font-semibold text-stone-900 mb-3'>
            About Paperazzi
          </h1>
          <p className='text-stone-600 leading-relaxed'>
            A focused search tool for economics research, emphasizing precision
            over recall.
          </p>
        </div>

        <div className='space-y-12'>
          {/* What it does */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <BookOpen size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                What it does
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-stone-200'>
              <p className='text-stone-700 mb-4'>
                Paperazzi searches economics papers with two core features:
              </p>
              <ul className='space-y-2 text-stone-600'>
                <li className='flex items-start gap-2'>
                  <span className='text-stone-400 mt-1'>1.</span>
                  <span>Filter by journal using CNRS categorization</span>
                </li>
                <li className='flex items-start gap-2'>
                  <span className='text-stone-400 mt-1'>2.</span>
                  <span>Explore forward and backward citations</span>
                </li>
              </ul>
            </div>
          </section>

          {/* How to use */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <Search size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                How to use
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-stone-200'>
              <ul className='space-y-3 text-stone-600'>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-xs flex items-center justify-center mt-0.5'>
                    1
                  </span>
                  <span>Search by keyword</span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-xs flex items-center justify-center mt-0.5'>
                    2
                  </span>
                  <span>
                    Filter by topic, journal, author, institution, or
                    publication year
                  </span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-xs flex items-center justify-center mt-0.5'>
                    3
                  </span>
                  <span>Sort by relevance, date, or citation count</span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-xs flex items-center justify-center mt-0.5'>
                    4
                  </span>
                  <span>
                    Pin papers to your collection and explore citation networks
                  </span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full bg-stone-200 text-stone-600 text-xs flex items-center justify-center mt-0.5'>
                    5
                  </span>
                  <span>
                    Optionally, click "Alert" to download code for monthly email
                    notifications via GitHub Actions
                  </span>
                </li>
              </ul>
            </div>
          </section>

          {/* Comparison */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <Scale size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Comparison with Google Scholar
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-stone-200'>
              <p className='text-stone-700 mb-6'>
                <span className='font-medium text-stone-900'>
                  Paperazzi emphasizes precision over recall.
                </span>{' '}
                Whereas Google Scholar retrieves broad, exhaustive results often
                with substantial noise, Paperazzi focuses on identifying
                relevant papers published in leading economics journals.
              </p>

              <div className='bg-white rounded-lg border border-stone-200 overflow-hidden'>
                <table className='w-full text-sm'>
                  <thead>
                    <tr className='border-b border-stone-200'>
                      <th className='text-left py-3 px-4 font-medium text-stone-500'>
                        Feature
                      </th>
                      <th className='text-left py-3 px-4 font-medium text-stone-500'>
                        Paperazzi
                      </th>
                      <th className='text-left py-3 px-4 font-medium text-stone-500'>
                        Scholar
                      </th>
                    </tr>
                  </thead>
                  <tbody className='text-stone-600'>
                    <tr className='border-b border-stone-100'>
                      <td className='py-3 px-4 text-stone-700'>
                        Journal filtering
                      </td>
                      <td className='py-3 px-4'>
                        ISSN-based with CNRS ranking
                      </td>
                      <td className='py-3 px-4 text-stone-400'>
                        Text-based matching
                      </td>
                    </tr>
                    <tr className='border-b border-stone-100'>
                      <td className='py-3 px-4 text-stone-700'>Citations</td>
                      <td className='py-3 px-4'>Forward & backward</td>
                      <td className='py-3 px-4 text-stone-400'>Forward only</td>
                    </tr>
                    <tr>
                      <td className='py-3 px-4 text-stone-700'>Scope</td>
                      <td className='py-3 px-4'>Economics-focused</td>
                      <td className='py-3 px-4 text-stone-400'>All fields</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p className='text-sm text-stone-500 mt-4'>
                For (inconsistent) text-based journal filtering in Scholar, see previous project {' '}
                <a
                  href='https://scholar-filter.vercel.app/'
                  className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  scholar-filter.vercel.app
                </a>
              </p>
            </div>
          </section>

          {/* Data source */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <Database size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Data sources
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-stone-200'>
              <div className='space-y-4'>
                <div>
                  <p className='text-stone-700'>
                    <span className='font-medium'>Paper metadata:</span>{' '}
                    <a
                      href='https://openalex.org/'
                      className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      OpenAlex
                    </a>
                    , an open database of academic publications.
                  </p>
                </div>
                <div>
                  <p className='text-stone-700'>
                    <span className='font-medium'>Journal categorization:</span>{' '}
                    <a
                      href='https://www.gate.cnrs.fr/wp-content/uploads/2021/12/categorisation37_liste_juin_2020-2.pdf'
                      className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      CNRS Economics Journal Rankings
                    </a>{' '}
                    <span className='text-stone-500'>(2020, French)</span>
                  </p>
                  <p className='text-sm text-stone-500 mt-1'>
                    CNRS stopped categorizing economics journals in 2020, but
                    the list remains widely used unofficially.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Contribute */}
          <section>
            <div className='flex items-center gap-2 mb-4'>
              <Heart size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Help improve the data
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-stone-200'>
              <p className='text-stone-700 mb-4'>
                OpenAlex is a non-profit, open-source project. Like any large
                database, it contains some errors — missing papers, incorrect
                metadata, or misattributed citations.
              </p>
              <p className='text-stone-700 mb-4'>
                You can help by reporting errors. OpenAlex is also working on
                enabling direct community edits in the future.
              </p>
              <div className='bg-white rounded-lg border border-stone-200 p-4'>
                <p className='text-sm text-stone-700 mb-3'>
                  <span className='font-medium'>Found an error?</span>
                </p>

                <a
                  href='https://help.openalex.org/hc/en-us/articles/27714298573719-Fix-errors-in-OpenAlex'
                  className='inline-flex items-center gap-2 text-sm text-stone-700 hover:text-stone-900 underline underline-offset-2'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  Fix errors in OpenAlex →
                </a>
              </div>
              <p className='text-sm text-stone-500 mt-4'>
                Contributing to OpenAlex helps build open infrastructure for
                academic research — reducing reliance on dominant platforms.
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className='mt-16 pt-8 border-t border-stone-200 text-center'>
          <p className='text-sm text-stone-500 mb-2'>
            Built for economics researchers, by an economics researcher.
          </p>

          <a
            href='https://npasquier.github.io/'
            className='text-sm text-stone-400 hover:text-stone-600 transition'
            target='_blank'
            rel='noopener noreferrrr'
          >
            npasquier
          </a>
        </div>
      </div>
    </main>
  );
}
