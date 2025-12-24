import type { Metadata } from 'next';
import PaperazziApp from '../components/PaperazziApp';

export const metadata: Metadata = {
  title: 'Paperazzi',
  description: 'Search through economics papers',
};

export default function Page() {
  return (
    <main className='h-screen bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800'>
      <PaperazziApp />
    </main>
  );
}
