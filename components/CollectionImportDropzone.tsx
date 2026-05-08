'use client';

import { useEffect, useRef, useState } from 'react';
import { Library, Upload } from 'lucide-react';
import { usePins } from '@/contexts/PinContext';
import { readCollectionImportFile } from '@/utils/pinCollectionTransfer';

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
  const { importCollection } = usePins();
  const dragDepthRef = useRef(0);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

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
        const parsed = await readCollectionImportFile(file);
        if (!parsed.ok) {
          setFeedback({
            kind: 'error',
            message: parsed.error,
          });
          return;
        }

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
          message: "Couldn't import that collection.",
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
  }, [importCollection]);

  return (
    <>
      {isDraggingFiles && (
        <div className='fixed inset-0 z-[70] overlay-soft pointer-events-none flex items-center justify-center p-6'>
          <div className='w-full max-w-2xl rounded-2xl border-2 border-dashed border-[var(--accent-border)] bg-[color:rgb(253_250_243_/0.96)] px-8 py-10 shadow-2xl text-center'>
            <div className='mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-foreground)]'>
              <Upload size={24} />
            </div>
            <p className='text-base font-semibold text-stone-800'>
              Drop shared collection to import
            </p>
            <p className='mt-2 text-sm text-stone-600'>
              Paperazzi will create a new collection with its pinned papers
              and groups.
            </p>
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
