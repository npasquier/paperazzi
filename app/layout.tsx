import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import NavBar from '../components/NavBar';
import { PinProvider } from '@/contexts/PinContext';
import { Analytics } from '@vercel/analytics/next';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Paperazzi',
  description: 'Track star papers in economics literature',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Analytics />
        <PinProvider>
          {/* Fixed-height shell — locks total height to the viewport so the
              navbar and main split it cleanly and only the inner scroller
              (e.g. SearchResults' results list) can scroll. min-h would let
              children overflow, which pushed body off-screen and produced a
              page-level scrollbar. */}
          <div className='flex h-[100dvh] flex-col overflow-hidden'>
            <NavBar />
            <div className='flex-1 min-h-0 overflow-hidden'>{children}</div>
          </div>
        </PinProvider>
      </body>
    </html>
  );
}
