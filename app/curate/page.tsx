// /curate — abstract curation dashboard. Find OpenAlex works missing an
// abstract, recover it, and hand it to the OpenAlex correction form.
//
// Server Component shell (so the `metadata` export is honoured); the dashboard
// itself is a Client Component and the App Router code-splits at this route
// boundary. Same pattern as /rankings.

import CurateDashboard from '@/components/curate/CurateDashboard';

export const metadata = {
  title: 'Curate · Paperazzi',
};

export default function CuratePage() {
  return (
    <main className='app-scrollbar h-full overflow-y-auto bg-[var(--background)]'>
      <div className='max-w-6xl mx-auto px-6 py-6 w-full'>
        <CurateDashboard />
      </div>
    </main>
  );
}
