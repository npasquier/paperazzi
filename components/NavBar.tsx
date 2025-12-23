// NavBar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavBar() {
  const pathname = usePathname();

  return (
    <nav className='flex items-center justify-between px-6 py-3 border-b bg-white sticky top-0 z-50'>
      <Link href='/' className='text-xl font-bold text-blue-600'>
        Paperazzi
      </Link>
    </nav>
  );
}
