// /rankings — user-facing editor for the active RankingScheme.
//
// Server Component: stays a pure shell so the `metadata` export is honoured.
// The actual editor (`components/rankings/RankingsEditor.tsx`) is a Client
// Component (`'use client'`), and the App Router code-splits at the route
// boundary, so importing it directly here still yields per-page lazy
// loading without us needing `next/dynamic`.
//
// We can't use `next/dynamic` with `ssr: false` in a Server Component
// (Next.js 16 forbids it), and switching the page to `'use client'` would
// break the metadata export — hence the plain import below.

import RankingsEditor from '@/components/rankings/RankingsEditor';

export const metadata = {
  title: 'Rankings · Paperazzi',
};

export default function RankingsPage() {
  return (
    // Layout matches the other top-level pages (about, help): a full-height
    // scroll container so the editor's tall journals table can scroll
    // independently of the surrounding navbar/chrome. `app-scrollbar` is
    // the project's themed scrollbar style.
    <main className='app-scrollbar h-full overflow-y-auto bg-[var(--background)]'>
      <div className='max-w-6xl mx-auto px-6 py-6 w-full'>
        <RankingsEditor />
      </div>
    </main>
  );
}
