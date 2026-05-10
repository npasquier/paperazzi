// "Help improve OpenAlex" call-to-action modal.
//
// Triggered by the Flag icon in the navbar. The modal exists because a
// one-click invitation has way better odds of getting a correction
// submitted than a help-page link that the user has to scroll through.
//
// Intent: a short pitch + a clear pointer to the friction-free path —
// the in-card flag icon on every paper card / author chip, which
// pre-fills the OpenAlex ID and links the right correction form. The
// full canonical write-up still lives at /help#contribute.

'use client';

import { useEffect } from 'react';
import { Flag, X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ContributeModal({ isOpen, onClose }: Props) {
  // Esc closes. Wired here (not on a child element) so it works even
  // when no element inside the modal currently has focus.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className='fixed inset-0 overlay-soft flex items-center justify-center z-50 p-4'
      onClick={onClose}
      role='dialog'
      aria-modal='true'
      aria-labelledby='contribute-modal-title'
    >
      <div
        className='surface-card border border-app rounded-lg shadow-lg max-w-lg w-full p-6'
        // Stop overlay-click propagation so clicking inside the card
        // doesn't dismiss the modal.
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between gap-3 mb-3'>
          <div className='flex items-center gap-2'>
            <Flag size={18} className='text-accent-strong' />
            <h2
              id='contribute-modal-title'
              className='text-base font-semibold text-stone-900'
            >
              Help improve open scholarly data
            </h2>
          </div>
          <button
            onClick={onClose}
            className='text-app-soft hover:text-app p-1 -mt-1 -mr-1 transition'
            aria-label='Close'
          >
            <X size={16} />
          </button>
        </div>

        <p className='text-sm text-stone-700 leading-relaxed mb-3'>
          Paperazzi reads from{' '}
          <a
            href='https://openalex.org/'
            target='_blank'
            rel='noopener noreferrer'
            className='underline underline-offset-2 hover:text-stone-900'
          >
            OpenAlex
          </a>
          — an open, non-profit catalog of scholarly works that&apos;s rapidly
          becoming the data layer for most of academia. It&apos;s only as good
          as the corrections people send in. Spot a wrong author, a garbled
          title, a missing PDF? Two minutes of your time and the next
          researcher who finds that paper sees the fix.
        </p>

        <div className='banner-info rounded-lg p-3 mb-4 text-sm'>
          <p className='font-medium text-stone-900 mb-1 inline-flex items-center gap-1.5'>
            <Flag size={13} className='text-accent-strong' />
            Paperazzi does the paperwork for you
          </p>
          <p className='text-stone-700 leading-relaxed'>
            Click the small flag icon on any paper card (or next to an
            author&apos;s name). A panel slides open with the paper&apos;s or
            author&apos;s <strong>OpenAlex ID</strong> pre-filled and a copy
            button, plus the <strong>direct link</strong> to the right
            correction form — no hunting through OpenAlex for the right ID
            yourself.
          </p>
        </div>

      </div>
    </div>
  );
}
