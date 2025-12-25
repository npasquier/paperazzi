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
            economics literature. It allows <i>filtering by journals</i> and{' '}
            <i>navigating forward and backward citations</i>.
          </p>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>How it works</h2>
          <ul className='list-disc list-inside space-y-2 text-slate-700'>
            <li>
              Keywords are matched only in <strong>titles and abstracts</strong>
              , so every result is explicitly about your topic.
            </li>
            <li>
              Journals are filtered using their <strong>ISSN</strong> and
              grouped by the official <strong>CNRS classification</strong>.
            </li>
            <li>
              Each paper is embedded in a citation network:
              <ul className='list-decimal list-inside ml-4 mt-1'>
                <li>Backward citations: the papers it builds upon.</li>
                <li>Forward citations: the papers that build upon it.</li>
              </ul>
            </li>
            <li>Direct access to DOI and publisher PDF whenever available.</li>
          </ul>
          <p className='text-slate-700 mt-4'>
            Data is sourced from <a href='https://openalex.org/'>OpenAlex</a>, a
            comprehensive open database of scholarly papers.
          </p>
        </section>

        <section className='bg-white p-6 rounded-xl shadow-sm'>
          <h2 className='text-xl font-semibold mb-3'>
            How Paperazzi Differs from Google Scholar
          </h2>

          <p className='text-slate-700 mb-4'>
            Google Scholar is excellent for broad discovery, but it often
            returns thousands of loosely related results. Paperazzi is designed
            for
            <strong> precise academic exploration</strong>: it trades recall for
            relevance and gives you more control over what you are actually
            searching.
          </p>

          <div className='grid md:grid-cols-2 gap-6'>
            <div>
              <h3 className='font-semibold mb-1'>
                What Paperazzi shares with Scholar
              </h3>
              <ul className='list-disc list-inside text-slate-700'>
                <li>Keyword-based search.</li>
                <li>
                  Filtering by journals (although very difficult in Google).
                </li>
                <li>Navigation through forward citations.</li>
              </ul>
            </div>

            <div>
              <h3 className='font-semibold mb-1'>
                What makes Paperazzi different
              </h3>
              <ul className='list-disc list-inside text-slate-700 space-y-1'>
                <li>
                  <strong>Search scope is more explicit:</strong> queries run
                  only on
                  <i> titles and abstracts</i>. Scholar scans full PDFs (greater
                  recall but greater noise).
                </li>
                <li>
                  <strong>Meaningful journal filtering:</strong> journals are
                  grouped using the <i>CNRS categorization</i>, not opaque
                  relevance scores. Paperazzi uses ISSN to filter journals,
                  instead Google uses names which are often inconsistent.
                </li>
                <li>
                  <strong>Bidirectional citation navigation:</strong> explore
                  both
                  <i> backward and forward citations</i> to map the intellectual
                  structure of a field.
                </li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
