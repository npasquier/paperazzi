'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search } from 'lucide-react';

export default function NavBar() {
  return (
    <nav className='sticky top-0 z-50 backdrop-blur-md bg-white/80 border-b border-slate-200 shadow-sm'>
      <div className='flex items-center justify-between px-6 py-3 max-w-7xl mx-auto'>
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
            Paper<span className='text-blue-600'>azzi</span>
          </span>
        </Link>

        {/* Tagline */}
        <div className='hidden md:flex items-center gap-2 text-sm text-slate-500 italic'>
          Uncover star papers in the economics literature
        </div>
        <Link
          href='/about'
          className='text-sm text-slate-700 hover:text-blue-600 transition'
        >
          About
        </Link>
      </div>
    </nav>
  );
}
