'use client';

// Small in-app confirmation modal (replaces window.confirm so the
// dialog matches the app's theme and can carry rich body content).
// Split out of RankingsEditor.tsx in the 2026-06 L2 decomposition.

export default function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmTone,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmTone: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className='fixed inset-0 overlay-soft flex items-center justify-center z-50 p-4'>
      <div className='surface-card border border-app rounded-lg shadow-lg p-5 max-w-md w-full space-y-3'>
        <h3 className='text-base font-semibold text-stone-900'>{title}</h3>
        <div className='text-sm text-app-muted'>{body}</div>
        <div className='flex items-center justify-end gap-2 pt-2'>
          <button
            onClick={onCancel}
            className='px-3 py-1.5 button-secondary rounded-lg text-sm'
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg text-sm ${
              confirmTone === 'danger'
                ? 'bg-[var(--danger-bg)] text-[var(--danger-foreground)] border border-[var(--danger-border)]'
                : 'button-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
