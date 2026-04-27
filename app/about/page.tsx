import { BookOpen, Search, Database, Scale, Heart } from 'lucide-react';

export default function AboutPage() {
  return (
    <main className='app-scrollbar h-full overflow-y-auto bg-[var(--background)]'>
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
            <div className='pl-6 border-l-2 border-app'>
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
            <div className='pl-6 border-l-2 border-app'>
              <ul className='space-y-3 text-stone-600'>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    1
                  </span>
                  <span>Search by keyword</span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    2
                  </span>
                  <span>
                    Filter by topic, journal, author, institution, or
                    publication year
                  </span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    3
                  </span>
                  <span>Sort by relevance, date, or citation count</span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    4
                  </span>
                  <span>
                    Pin papers to your collection and explore citation networks
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
                How Paperazzi compares
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app'>
              <p className='text-stone-700 mb-6'>
                Paperazzi is an exploration tool dedicated to the economics
                literature. It leverages
                <span className='font-medium text-stone-900'> OpenAlex </span>
                open data and adds a layer of economics-journal filtering on
                top. It offers several research-oriented features (e.g.,
                citation network visualization, paper pinning, and
                economics-specific filters) that are not jointly available in
                general-purpose academic search engines.
              </p>

              {/* TL;DR table — quick scan; details follow below */}
              <div className='surface-card rounded-lg border border-app overflow-hidden mb-6'>
                <div className='overflow-x-auto'>
                  <table className='w-full text-xs'>
                    <thead>
                      <tr className='border-b border-app surface-muted'>
                        <th className='text-left py-2 px-3 font-medium text-stone-500 whitespace-nowrap'></th>
                        <th className='text-left py-2 px-3 font-medium text-stone-700 whitespace-nowrap'>
                          Paperazzi
                        </th>
                        <th className='text-left py-2 px-3 font-medium text-stone-500 whitespace-nowrap'>
                          OpenAlex
                        </th>
                        <th className='text-left py-2 px-3 font-medium text-stone-500 whitespace-nowrap'>
                          ResearchRabbit
                        </th>
                        <th className='text-left py-2 px-3 font-medium text-stone-500 whitespace-nowrap'>
                          Semantic Scholar
                        </th>
                        <th className='text-left py-2 px-3 font-medium text-stone-500 whitespace-nowrap'>
                          Google Scholar
                        </th>
                      </tr>
                    </thead>
                    <tbody className='text-stone-600'>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Field scope
                        </td>
                        <td className='py-2 px-3'>Economics</td>
                        <td className='py-2 px-3 text-stone-400'>All</td>
                        <td className='py-2 px-3 text-stone-400'>All</td>
                        <td className='py-2 px-3 text-stone-400'>All</td>
                        <td className='py-2 px-3 text-stone-400'>All</td>
                      </tr>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Journal filtering
                        </td>
                        <td className='py-2 px-3'>CNRS based, ISSN-precise</td>
                        <td className='py-2 px-3 text-stone-400'>
                          ISSN-precise
                        </td>
                        <td className='py-2 px-3 text-stone-400'>
                          Subject area
                        </td>
                        <td className='py-2 px-3 text-stone-400'>
                          Subject area
                        </td>
                        <td className='py-2 px-3 text-stone-400'>Text-based</td>
                      </tr>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Citation network
                        </td>
                        <td className='py-2 px-3'>Year × cites, filterable</td>
                        <td className='py-2 px-3 text-stone-400'>API only</td>
                        <td className='py-2 px-3 text-stone-400'>
                          Year × cites
                        </td>
                        <td className='py-2 px-3 text-stone-400'>
                          Linear list
                        </td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                      </tr>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Citation direction
                        </td>
                        <td className='py-2 px-3'>Forward + backward</td>
                        <td className='py-2 px-3 text-stone-400'>Both</td>
                        <td className='py-2 px-3 text-stone-400'>
                          One at a time
                        </td>
                        <td className='py-2 px-3 text-stone-400'>Both</td>
                        <td className='py-2 px-3 text-stone-400'>
                          Forward only
                        </td>
                      </tr>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          AI summaries
                        </td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                        <td className='py-2 px-3'>TLDRs</td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                      </tr>
                      <tr className='border-b border-app-muted'>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Pinning / library
                        </td>
                        <td className='py-2 px-3'>Groups + colors</td>
                        <td className='py-2 px-3 text-stone-400'>—</td>
                        <td className='py-2 px-3 text-stone-400'>
                          Collections
                        </td>
                        <td className='py-2 px-3 text-stone-400'>Library</td>
                        <td className='py-2 px-3 text-stone-400'>Library</td>
                      </tr>
                      <tr>
                        <td className='py-2 px-3 text-stone-700 whitespace-nowrap'>
                          Alerting
                        </td>
                        <td className='py-2 px-3'>
                          Use 'saved searches', No email alert
                        </td>
                        <td className='py-2 px-3 text-stone-400'>API access</td>
                        <td className='py-2 px-3 text-stone-400'>
                          Email digests
                        </td>
                        <td className='py-2 px-3 text-stone-400'>
                          Email + RSS
                        </td>
                        <td className='py-2 px-3 text-stone-400'>Email</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className='space-y-5'>
                {/* vs OpenAlex */}
                <div className='surface-card rounded-lg border border-app p-4'>
                  <h3 className='text-sm font-semibold text-stone-900 mb-2'>
                    vs OpenAlex
                  </h3>
                  <p className='text-sm text-stone-700 mb-2'>
                    OpenAlex provides the underlying data with a strong emphasis
                    on Open Access research. Paperazzi is an economics-focused
                    interface built on top of it. We do not crawl or index
                    content ourselves — we query the OpenAlex API and add
                    journal filtering, citation network views, and paper
                    pinning. The OpenAlex interface is more general-purpose and
                    covers all academic fields.
                  </p>
                  <p className='text-xs text-stone-500'>
                    Use OpenAlex directly when you need raw API access, want to
                    explore fields outside economics, or analyze Open Access
                    rates and publication trends over time.
                  </p>
                </div>

                {/* vs ResearchRabbit */}
                <div className='surface-card rounded-lg border border-app p-4'>
                  <h3 className='text-sm font-semibold text-stone-900 mb-2'>
                    vs ResearchRabbit
                  </h3>
                  <p className='text-sm text-stone-700 mb-2'>
                    ResearchRabbit offers free-form network exploration across
                    every field. Paperazzi gives you a comparable network view
                    but you can constrain it to economics journals or the
                    journals you are interested in. It also delivers a forward
                    and backward citation view, whereas Rabbit only shows
                    backward or forward citations. Paperazzi uses the same year
                    × log-citations axes ResearchRabbit popularized.
                  </p>
                  <p className='text-xs text-stone-500'>
                    Reach for ResearchRabbit when your research crosses fields
                    or when you want freeform clustering. Use Paperazzi when you
                    want journal-quality filtering baked in.
                  </p>
                </div>

                {/* vs Semantic Scholar */}
                <div className='surface-card rounded-lg border border-app p-4'>
                  <h3 className='text-sm font-semibold text-stone-900 mb-2'>
                    vs Semantic Scholar
                  </h3>
                  <p className='text-sm text-stone-700 mb-2'>
                    Semantic Scholar emphasizes AI-generated TLDRs,
                    recommendation feeds, and broad-field coverage. Paperazzi
                    emphasizes deliberate journal selection and a citation
                    network view you can navigate with year × log-citation axes.
                    We don&apos;t use AI.
                  </p>
                  <p className='text-xs text-stone-500'>
                    Reach for Semantic Scholar when you want abstractive
                    summaries or cross-field discovery; Paperazzi when journal
                    quality is the primary filter.
                  </p>
                </div>

                {/* vs Google Scholar */}
                <div className='surface-card rounded-lg border border-app p-4'>
                  <h3 className='text-sm font-semibold text-stone-900 mb-2'>
                    vs Google Scholar
                  </h3>
                  <p className='text-sm text-stone-700 mb-2'>
                    <span className='font-medium text-stone-900'>
                      Paperazzi emphasizes precision over recall.
                    </span>{' '}
                    Where Google Scholar returns broad, exhaustive results with
                    substantial noise, Paperazzi narrows to papers published in
                    CNRS-categorized economics journals. Citations are visible
                    in both directions (forward and backward) rather than
                    forward-only.
                  </p>
                  <p className='text-xs text-stone-500'>
                    For (inconsistent) text-based journal filtering on top of
                    Scholar, see a previous project of mine:{' '}
                    <a
                      href='https://scholar-filter.vercel.app/'
                      className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      scholar-filter.vercel.app
                    </a>
                    .
                  </p>
                </div>
              </div>
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
            <div className='pl-6 border-l-2 border-app'>
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
            <div className='pl-6 border-l-2 border-app'>
              <p className='text-stone-700 mb-4'>
                OpenAlex is a non-profit, open-source project. Like any large
                database, it contains some errors — missing papers, incorrect
                metadata, or misattributed citations.
              </p>
              <p className='text-stone-700 mb-4'>
                You can help by reporting errors. OpenAlex is also working on
                enabling direct community edits in the future.
              </p>
              <div className='surface-card rounded-lg border border-app p-4'>
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
        <div className='mt-16 pt-8 border-t border-app text-center space-y-2'>
          <p className='text-sm text-stone-700'>
            Built by{' '}
            <a
              href='https://npasquier.github.io/'
              className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
              target='_blank'
              rel='noopener noreferrer'
            >
              Nicolas Pasquier
            </a>
            , researcher in economics at{' '}
            {/* Replace [your institution] with your real affiliation */}
            <span className='text-stone-500'>GAEL</span>.
          </p>
          <p className='text-xs text-stone-500'>
            Open-source —{' '}
            <a
              href='https://github.com/npasquier/paperazzi'
              className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
              target='_blank'
              rel='noopener noreferrer'
            >
              View on GitHub
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
