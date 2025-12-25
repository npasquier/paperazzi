'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className='sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200 shadow-sm'>
      <div className='flex items-center px-6 py-3 max-w-7xl mx-auto'>
        {/* Brand */}
        <Link href='/' className='flex items-center gap-3 group'>
          <div className='bg-blue-100 p-1.5 rounded-lg group-hover:bg-blue-200 transition'>
            <Image
              src='/binocular.svg'
              alt='Paperazzi logo'
              width={28}
              height={28}
            />
          </div>
          <span className='text-xl font-semibold tracking-tight text-slate-800'>
            <span className='text-blue-700'>Paper</span>azzi
          </span>
        </Link>

        {/* Tagline */}
        <div className='hidden ml-6 md:flex items-center gap-2 text-sm text-slate-500'>
          Uncover star papers in the economics literature
        </div>
        <Link
          href='/about'
          className='text-sm ml-auto text-slate-700 hover:text-blue-600 transition'
        >
          About
        </Link>
      </div>
    </nav>
  );
}
