import type { Metadata } from 'next';
import PaperazziApp from '../components/PaperazziApp';

export const metadata: Metadata = {
  title: 'Paperazzi',
  description: 'Search through economics papers',
};

export default function Page() {
  return (
    <main className='bombay-bg-color cold-gray-color'>
      <PaperazziApp />
    </main>
  );
}
