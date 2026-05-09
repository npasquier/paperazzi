'use client';

import { useEffect, useRef, useState } from 'react';
import { Library, Upload, AlertTriangle } from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { readImportFile } from '@/utils/pinCollectionTransfer';
import { restoreAllPaperazziStorage } from '@/utils/storageKeys';

type Feedback =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

function dragEventHasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export default function CollectionImportDropzone() {
  const { importCollection, importLibrary } = usePins();
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Holds a parsed full-backup waiting for user confirmation. Full
  // backups REPLACE every Paperazzi-authored localStorage entry, so
  // we always show a confirm dialog before applying — even if the
  // user's just-erased browser is empty, the explicit consent loop
  // matches user intent ("did I really mean to wipe-and-restore?").
  const [pendingFullBackup, setPendingFullBackup] = useState<{
    entries: Record<string, string>;
    keyCount: number;
  } | null>(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const resetDragState = () => {
      dragDepthRef.current = 0;
      setIsDraggingFiles(false);
    };

    const onDragEnter = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setIsDraggingFiles(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      setIsDraggingFiles(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingFiles(false);
      }
    };

    const onDrop = async (event: DragEvent) => {
      if (!dragEventHasFiles(event)) return;
      event.preventDefault();
      resetDragState();

      const file = event.dataTransfer?.files?.[0];
      if (!file) {
        setFeedback({
          kind: 'error',
          message: 'Drop a Paperazzi collection file to import it.',
        });
        return;
      }

      try {
        // The unified parser dispatches on the file's `format` field
        // and tells us whether the user dropped a single collection
        // or a full library backup.
        const parsed = await readImportFile(file);
        if (!parsed.ok) {
          setFeedback({
            kind: 'error',
            message: parsed.error,
          });
          return;
        }

        if (parsed.kind === 'full-backup') {
          // Parked in confirm-modal state until the user clicks
          // "Restore". The actual write + reload happens in
          // `applyPendingFullBackup` below.
          setPendingFullBackup({
            entries: parsed.data,
            keyCount: Object.keys(parsed.data).length,
          });
          return;
        }

        if (parsed.kind === 'library') {
          const result = importLibrary(parsed.data);
          if (result.status === 'empty') {
            setFeedback({
              kind: 'error',
              message: 'That library export is empty.',
            });
            return;
          }
          if (result.status === 'cap-exceeded') {
            setFeedback({
              kind: 'error',
              message:
                result.available === 0
                  ? `That library has ${result.required} collections, but you have no slots left. Delete some collections first.`
                  : `That library has ${result.required} collections, but only ${result.available} slot${
                      result.available === 1 ? '' : 's'
                    } remain. Delete some collections first.`,
            });
            return;
          }
          const collectionLabel =
            result.importedCollectionCount === 1 ? 'collection' : 'collections';
          const paperLabel =
            result.importedPaperCount === 1 ? 'paper' : 'papers';
          setFeedback({
            kind: 'success',
            message: `Imported library: ${result.importedCollectionCount} ${collectionLabel} (${result.importedPaperCount} ${paperLabel}).`,
          });
          return;
        }

        // Single-collection drop.
        const result = importCollection(parsed.data);
        if (result.status === 'cap-reached') {
          setFeedback({
            kind: 'error',
            message: 'Delete a collection before importing another one.',
          });
          return;
        }

        const groupLabel =
          result.importedGroupCount === 1 ? 'group' : 'groups';
        const paperLabel =
          result.importedPaperCount === 1 ? 'paper' : 'papers';
        setFeedback({
          kind: 'success',
          message: `Imported "${result.name}" with ${result.importedPaperCount} ${paperLabel} and ${result.importedGroupCount} ${groupLabel}.`,
        });
      } catch (err) {
        console.error('[CollectionImportDropzone] import failed', err);
        setFeedback({
          kind: 'error',
          message: "Couldn't import that file.",
        });
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('blur', resetDragState);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('blur', resetDragState);
    };
  }, [importCollection, importLibrary]);

  // Escape closes the confirm dialog. Backdrop click is wired via
  // the dialog markup itself.
  useEffect(() => {
    if (!pendingFullBackup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPendingFullBackup(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingFullBackup]);

  // Commit the parked backup: wipe Paperazzi keys + write the
  // snapshot, then reload so every context (PinContext, FilterPanel,
  // sidebar, etc.) re-hydrates from the restored state. We don't try
  // to update React state in-place because re-running every
  // hydration path manually is brittle compared to a single reload.
  const applyPendingFullBackup = () => {
    if (!pendingFullBackup) return;
    try {
      restoreAllPaperazziStorage(pendingFullBackup.entries);
      window.location.reload();
    } catch (err) {
      console.error('[CollectionImportDropzone] full-backup restore failed', err);
      setFeedback({
        kind: 'error',
        message: "Couldn't restore that backup.",
      });
      setPendingFullBackup(null);
    }
  };

  return (
    <>
      {isDraggingFiles && (
        <div className='fixed inset-0 z-[70] overlay-soft pointer-events-none flex items-center justify-center p-6'>
          <div className='w-full max-w-2xl rounded-2xl border-2 border-dashed border-[var(--accent-border)] bg-[color:rgb(253_250_243_/0.96)] px-8 py-10 shadow-2xl text-center'>
            <div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-foreground)]'>
              <Upload size={24} />
            </div>
            <p className='text-base font-semibold text-stone-800'>
              Drop a Paperazzi export to import
            </p>
            <p className='mt-2 text-sm text-stone-600'>
              A single collection becomes a new workspace, a library file
              restores every collection it contains, and a full backup
              restores every Paperazzi setting and pin in your browser.
            </p>
          </div>
        </div>
      )}

      {/* Full-backup confirmation modal. The drop already happened
          and we've parsed a valid backup; this dialog is the user's
          final check before we wipe-and-restore every Paperazzi
          localStorage key. Backdrop click + Escape both cancel; only
          the explicit "Restore" button writes anything. */}
      {pendingFullBackup && (
        <div
          className='fixed inset-0 z-[80] overlay-soft flex items-center justify-center'
          onClick={() => setPendingFullBackup(null)}
          role='dialog'
          aria-modal='true'
          aria-labelledby='paperazzi-full-backup-restore-title'
        >
          <div
            className='surface-card rounded-lg border border-app p-5 max-w-md w-full mx-4 shadow-lg'
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-start gap-3'>
              <div className='flex-shrink-0 mt-0.5 text-warning'>
                <AlertTriangle size={18} />
              </div>
              <div className='min-w-0 flex-1'>
                <h3
                  id='paperazzi-full-backup-restore-title'
                  className='text-sm font-semibold text-stone-900'
                >
                  Restore Paperazzi backup?
                </h3>
                <p className='mt-1.5 text-xs text-stone-600 leading-relaxed'>
                  This file contains a full snapshot of your Paperazzi data
                  ({pendingFullBackup.keyCount} entr
                  {pendingFullBackup.keyCount === 1 ? 'y' : 'ies'}). Restoring
                  will{' '}
                  <span className='font-medium text-stone-800'>
                    replace your current pins, collections, saved searches,
                    journal filters, and UI preferences
                  </span>{' '}
                  with the contents of the backup. The page will reload
                  afterwards.
                </p>
                <p className='mt-2 text-[11px] text-stone-500'>
                  Tip: export your current data first if you want a way back.
                </p>
              </div>
            </div>

            <div className='mt-4 flex justify-end gap-2'>
              <button
                onClick={() => setPendingFullBackup(null)}
                className='px-3 py-1.5 text-xs button-ghost rounded transition'
              >
                Cancel
              </button>
              <button
                onClick={applyPendingFullBackup}
                autoFocus
                className='px-3 py-1.5 text-xs button-primary rounded transition'
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role='status'
          aria-live='polite'
          className={`fixed bottom-4 right-4 z-[70] max-w-sm rounded-lg border px-3 py-2 text-sm shadow-lg ${
            feedback.kind === 'success'
              ? 'surface-card border-[var(--success-border)] text-[var(--success-foreground)]'
              : 'surface-card border-[var(--danger-border)] text-[var(--danger-foreground)]'
          }`}
        >
          <div className='flex items-start gap-2'>
            <Library size={14} className='mt-0.5 flex-shrink-0' />
            <span>{feedback.message}</span>
          </div>
        </div>
      )}
    </>
  );
}
