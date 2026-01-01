
export default function AboutPage() {
  return (
    <main className='min-h-[calc(100vh-57px)] bg-white'>
      <div className='max-w-3xl mx-auto px-6 py-12'>
        <h1 className='text-3xl font-bold text-slate-900 mb-8'>About</h1>

        <div className='space-y-8 text-slate-700'>
          {/* What it does */}
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-900'>What it does</h2>
            <p>
              Paperazzi searches economics papers with two main features:
            </p>
            <ol className='list-decimal list-inside space-y-1 ml-4'>
              <li>Filter by journal using CNRS categorization</li>
              <li>Explore forward and backward citations</li>
            </ol>
          </section>

          {/* How to use */}
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-900'>How to use</h2>
            <ol className='list-decimal list-inside space-y-2 ml-4'>
              <li>Search by keyword</li>
              <li>Filter by journal, author, or publication year</li>
              <li>Sort by relevance, date, or citation count</li>
              <li>Click on a paper to see its citations (who cites it, what it cites)</li>
            </ol>
          </section>

          {/* Comparison with Google Scholar */}
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-900'>
              Comparison with Google Scholar
            </h2>
            <p>
              Google Scholar optimizes for recall (finding everything) but must accept more noise. 
              Paperazzi optimizes for precision (finding relevant papers in top journals) but lower recall.
            </p>
            
            <div className='mt-4'>
              <p className='font-medium text-slate-900 mb-2'>Key differences:</p>
              <ul className='list-disc list-inside space-y-1 ml-4'>
                <li>
                  <strong>Journal filtering:</strong> Uses ISSN-based filtering with last CNRS 
                  journal rankings, not text-based journal name matching
                </li>
                <li>
                  <strong>Citations:</strong> Shows both forward and backward citations 
                  (Scholar only shows forward)
                </li>
                <li>
                  <strong>Scope:</strong> Economics-focused, covers fewer papers than Scholar
                </li>
              </ul>
            </div>

            <p className='text-sm mt-4'>
              For ISSN-based journal filtering in Scholar, see{' '}
              <a 
                href='https://scholar-filter.vercel.app/' 
                className='text-stone-900 hover:underline font-semibold'
                target='_blank'
                rel='noopener noreferrer'
              >
                scholar-filter.vercel.app
              </a>
            </p>
          </section>

          {/* Data source */}
          <section className='space-y-3'>
            <h2 className='text-xl font-semibold text-slate-900'>Data source</h2>
            <p>
              Paper metadata and citations from{' '}
              <a 
                href='https://openalex.org/' 
                className='text-stone-900 hover:underline font-semibold'
                target='_blank'
                rel='noopener noreferrer'
              >
                OpenAlex
              </a>
              , an open database of academic publications.
            </p>
            <p>
              Journal categorization from{' '}
              <a 
                href='https://www.gate.cnrs.fr/spip.php?article206&lang=fr' 
                className='text-stone-900 hover:underline font-semibold'
                target='_blank'
                rel='noopener noreferrer'
              >
                CNRS economics journal rankings
              </a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}