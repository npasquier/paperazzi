'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Loader2,
  ExternalLink,
  BookOpen,
  Edit2,
  Check,
  CheckCircle,
  Copy,
  Trash2,
  Plus,
  Tag,
  StickyNote,
  Flag,
} from 'lucide-react';
import {
  MAX_PAPER_COMMENT_LENGTH,
  MAX_PAPER_KEYWORD_LENGTH,
  MAX_PAPER_KEYWORDS,
  Paper,
} from '@/types/interfaces';
import PinButton from './ui/PinButton';
import { cleanAbstract } from '@/utils/abstract';
import { usePins } from '@/contexts/PinContext';
import { normalizeId } from '@/utils/normalizeId';
import { openAlexFetch } from '@/utils/openAlexClient';
import { reportedPaperKey } from '@/utils/storageKeys';
import { emit } from '@/utils/eventBus';
import {
  PAPER_CORRECTION_FORM_URL,
  copyWorkIdAndOpenCorrectionForm,
  toOpenAlexWorkId,
} from '@/utils/correctionForms';

interface PaperInfoModalProps {
  paper: Paper;
  isOpen: boolean;
  onClose: () => void;
}

interface OpenAlexWorkDetails {
  abstract_inverted_index?: Record<string, number[]>;
}

export default function PaperInfoModal({
  paper,
  isOpen,
  onClose,
}: PaperInfoModalProps) {
  const [abstract, setAbstract] = useState<string>('');
  const [isLoadingAbstract, setIsLoadingAbstract] = useState(false);

  // Bare OpenAlex work id (e.g. `W2741809807`) — paired with the
  // correction form so the user can copy or submit it without having
  // to dig the id out of the URL themselves.
  const workId = toOpenAlexWorkId(paper.id);

  // Report-flag dropdown state. Mirrors the bottom-right flag panel
  // on the SearchResults paper card so the contribution affordance
  // looks and behaves the same wherever it shows up.
  //   - `isInfoExpanded` toggles the panel open/closed.
  //   - `isCopied` flashes a check after the inline "Copy ID" press.
  //   - `hasReported` is the optimistic in-session toggle.
  //   - `isReportedStored` snapshots localStorage on mount so the
  //     panel remembers a previous report after a reload.
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [hasReported, setHasReported] = useState(false);
  const reportedKey = reportedPaperKey(workId);
  const [isReportedStored] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(reportedKey) === 'true';
    }
    return false;
  });
  const isReported = hasReported || isReportedStored;

  const toggleInfoPanel = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsInfoExpanded((open) => !open);
  };

  const copyWorkId = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(workId);
      setIsCopied(true);
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Shared click handler for the inline "help add it"/"Help add one"
  // CTAs and the dropdown's "Submit correction" button. Copies the
  // work id to the clipboard and opens the correction form so the
  // user can paste the id straight into the form's paper-id field.
  const handleReportClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void copyWorkIdAndOpenCorrectionForm(workId);
  };

  const handleReportedToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!hasReported && !isReportedStored) {
      // First time reporting — persist and let the rest of the app
      // celebrate (the SearchResults flow listens for this and shows
      // a one-off animation).
      setHasReported(true);
      if (typeof window !== 'undefined') {
        localStorage.setItem(reportedKey, 'true');
      }
      emit('paper-reported', { paperId: workId });
    } else {
      // Toggle off.
      setHasReported(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem(reportedKey);
      }
    }
  };

  // Notes + keywords are only meaningful for pinned papers — the
  // modal is also opened from the citations-network view, where the
  // paper isn't pinned and we hide the annotation UI entirely.
  const { pinnedPapers, isPinned, updatePaperComment, updatePaperKeywords } =
    usePins();
  const isPaperPinned = isPinned(paper.id);
  // Always read the live pinned record (it has the latest comment +
  // keywords) when available, falling back to the prop. This matters
  // because some callers — the citations network in particular — pass
  // a stale Paper that doesn't reflect the user's edits.
  const pinnedPaper = useMemo(
    () =>
      pinnedPapers.find(
        (p) => normalizeId(p.id) === normalizeId(paper.id),
      ),
    [pinnedPapers, paper.id],
  );
  const livePaper = pinnedPaper ?? paper;

  // Note editor — view / edit modes. We keep a draft string while
  // editing so an unsaved change can be discarded with Cancel.
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when the modal closes so opening it again on a
      // different paper doesn't leak the previous draft or the
      // expanded report panel from the last view.
      setIsEditingNote(false);
      setNoteDraft('');
      setIsInfoExpanded(false);
      setIsCopied(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isEditingNote) noteTextareaRef.current?.focus();
  }, [isEditingNote]);

  const startEditingNote = () => {
    setNoteDraft(livePaper.comment ?? '');
    setIsEditingNote(true);
  };

  const saveNote = () => {
    updatePaperComment(paper.id, noteDraft);
    setIsEditingNote(false);
  };

  const cancelEditNote = () => {
    setIsEditingNote(false);
    setNoteDraft('');
  };

  const removeNote = () => {
    updatePaperComment(paper.id, '');
    setIsEditingNote(false);
    setNoteDraft('');
  };

  // Keyword editor — chips with a remove × and an inline input.
  // Submission on Enter or comma. We don't keep a separate "edit
  // mode" toggle because inline editing is cheap; the only state is
  // the in-progress keyword draft.
  const [keywordDraft, setKeywordDraft] = useState('');
  const keywords = livePaper.keywords ?? [];
  const keywordCapReached = keywords.length >= MAX_PAPER_KEYWORDS;

  const commitKeywordDraft = () => {
    const next = keywordDraft.trim();
    if (!next) return;
    if (
      keywords.some((k) => k.toLowerCase() === next.toLowerCase()) ||
      keywordCapReached
    ) {
      setKeywordDraft('');
      return;
    }
    updatePaperKeywords(paper.id, [...keywords, next]);
    setKeywordDraft('');
  };

  const removeKeyword = (target: string) => {
    updatePaperKeywords(
      paper.id,
      keywords.filter((k) => k !== target),
    );
  };

  useEffect(() => {
    setAbstract(cleanAbstract(paper.abstract || ''));
    setIsLoadingAbstract(false);
  }, [paper.id, paper.abstract]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const initialAbstract = cleanAbstract(paper.abstract || '');
    if (initialAbstract) return;

    let cancelled = false;

    const fetchAbstract = async () => {
      setIsLoadingAbstract(true);
      try {
        const paperId = normalizeId(paper.id);
        const res = await openAlexFetch(
          `https://api.openalex.org/works/${paperId}`,
        );
        if (!res.ok) {
          if (!cancelled) setIsLoadingAbstract(false);
          return;
        }
        const data = (await res.json()) as OpenAlexWorkDetails;

        if (data.abstract_inverted_index) {
          const words: string[] = [];
          Object.entries(data.abstract_inverted_index).forEach(
            ([word, positions]) => {
              positions.forEach((p: number) => (words[p] = word));
            }
          );
          if (!cancelled) {
            setAbstract(cleanAbstract(words.join(' ')));
          }
        }
      } catch (error) {
        console.error('Failed to fetch abstract:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingAbstract(false);
        }
      }
    };

    fetchAbstract();
    return () => {
      cancelled = true;
    };
  }, [isOpen, paper.id, paper.abstract]);

  const openGoogleScholar = (title: string) => {
    const url = `https://scholar.google.com/scholar?q=${encodeURIComponent(
      title
    )}`;
    window.open(url, '_blank');
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className='fixed inset-0 z-50 flex items-center justify-center overlay-soft'
      onClick={onClose}
    >
      <div
        className='surface-card border border-app rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col mx-4 cursor-auto'
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      >
        <div className='flex items-start justify-between p-4 border-b border-app'>
          <div className='flex-1 min-w-0 pr-4 select-text'>
            <h2 className='text-lg font-semibold text-stone-900 leading-snug cursor-text'>
              {paper.title ? (
                paper.title
              ) : (
                // Missing-title fallback. Same intent as the card's
                // inline placeholder — convert the empty state into
                // a one-click contribution prompt rather than
                // displaying a silent gap.
                <span className='text-stone-400 italic font-normal text-base inline-flex items-baseline gap-2'>
                  <span>Untitled</span>
                  <a
                    href={PAPER_CORRECTION_FORM_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    onClick={handleReportClick}
                    className='text-[12px] not-italic font-medium text-accent-strong underline underline-offset-2 hover:no-underline inline-flex items-center gap-1'
                  >
                    <Flag size={11} />
                    help add it →
                  </a>
                </span>
              )}
            </h2>
            <p className='text-sm text-stone-600 mt-1 cursor-text'>
              {paper.authors.slice(0, 5).join(', ')}
              {paper.authors.length > 5 && ` +${paper.authors.length - 5} more`}
            </p>
            <p className='text-xs text-stone-500 mt-1 cursor-text'>
              {paper.journal_name} • {paper.publication_year} •{' '}
              {paper.cited_by_count} citations
            </p>
          </div>
          <button
            onClick={onClose}
            className='p-1 hover:bg-[var(--surface-muted)] rounded transition flex-shrink-0'
          >
            <X size={20} className='text-stone-500' />
          </button>
        </div>

        <div className='flex-1 overflow-y-auto p-4'>
          <div className='flex flex-wrap gap-2 mb-4'>
            <PinButton paper={paper} size='sm' />

            <button
              onClick={() => openGoogleScholar(paper.title)}
              className='inline-flex items-center gap-1.5 px-3 py-1.5 banner-info text-accent-strong rounded-lg transition text-xs font-medium'
            >
              <BookOpen size={14} />
              Google Scholar
            </button>

            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi.replace(
                  'https://doi.org/',
                  ''
                )}`}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1.5 px-3 py-1.5 button-secondary rounded-lg transition text-xs font-medium'
              >
                <ExternalLink size={14} />
                DOI
              </a>
            )}
          </div>

          <div className='select-text'>
            <h3 className='text-sm font-semibold text-stone-900 mb-2'>
              Abstract
            </h3>
            {abstract ? (
              <p className='text-sm text-stone-600 leading-relaxed cursor-text whitespace-pre-wrap'>
                {abstract}
              </p>
            ) : isLoadingAbstract ? (
              <div className='flex items-center gap-2 py-2 text-sm text-stone-500'>
                <Loader2 className='animate-spin text-stone-400' size={16} />
                Loading abstract...
              </div>
            ) : (
              // Missing-data CTA: instead of a dead "Not available"
              // line, convert the empty state into a contribution
              // prompt. The user just noticed the gap — that's the
              // best moment to convert frustration into action.
              <div className='banner-info border border-app rounded-md px-3 py-2.5'>
                <p className='text-sm text-stone-700 leading-snug'>
                  No abstract on OpenAlex.{' '}
                  <a
                    href={PAPER_CORRECTION_FORM_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    onClick={handleReportClick}
                    className='text-accent-strong font-medium underline underline-offset-2 hover:no-underline'
                  >
                    Help add one →
                  </a>
                </p>
                <p className='text-[11px] text-stone-500 mt-1'>
                  OpenAlex is open infrastructure — corrections from
                  researchers like you make every search better.
                </p>
              </div>
            )}
          </div>

          {/* Annotations — notes + keywords. Only rendered for pinned
              papers because that's where the data lives; for an
              unpinned paper the editor would have nowhere to write. */}
          {isPaperPinned && (
            <div className='mt-5 pt-4 border-t border-app space-y-4'>
              {/* Note */}
              <section>
                <div className='flex items-center justify-between mb-2'>
                  <h3 className='text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5'>
                    <StickyNote size={14} className='text-stone-500' />
                    Note
                  </h3>
                  {!isEditingNote && (
                    <div className='flex items-center gap-1'>
                      <button
                        onClick={startEditingNote}
                        className='inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 transition'
                        title={livePaper.comment ? 'Edit note' : 'Add note'}
                      >
                        <Edit2 size={12} />
                        {livePaper.comment ? 'Edit' : 'Add'}
                      </button>
                      {livePaper.comment && (
                        <button
                          onClick={removeNote}
                          className='inline-flex items-center gap-1 text-xs text-stone-400 hover:text-danger transition ml-2'
                          title='Remove note'
                        >
                          <Trash2 size={12} />
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {isEditingNote ? (
                  <div>
                    <textarea
                      ref={noteTextareaRef}
                      value={noteDraft}
                      onChange={(e) =>
                        setNoteDraft(
                          e.target.value.slice(0, MAX_PAPER_COMMENT_LENGTH),
                        )
                      }
                      onKeyDown={(e) => {
                        // Cmd/Ctrl + Enter saves; Escape cancels.
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          saveNote();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          cancelEditNote();
                        }
                      }}
                      placeholder='Why this paper matters to you, what to revisit, key takeaways...'
                      rows={3}
                      maxLength={MAX_PAPER_COMMENT_LENGTH}
                      className='w-full px-2.5 py-2 text-sm border border-app rounded-md bg-transparent focus-accent resize-y leading-relaxed'
                    />
                    <div className='mt-1.5 flex items-center justify-between gap-2'>
                      <span className='text-[11px] text-stone-400 tabular-nums'>
                        {noteDraft.length}/{MAX_PAPER_COMMENT_LENGTH}
                      </span>
                      <div className='flex items-center gap-1.5'>
                        <button
                          onClick={cancelEditNote}
                          className='px-2.5 py-1 text-xs button-ghost rounded transition'
                        >
                          Cancel
                        </button>
                        <button
                          onClick={saveNote}
                          className='inline-flex items-center gap-1 px-2.5 py-1 text-xs button-secondary rounded transition'
                        >
                          <Check size={12} />
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                ) : livePaper.comment ? (
                  <p className='text-sm text-stone-700 leading-relaxed whitespace-pre-wrap surface-subtle border border-app rounded-md px-3 py-2'>
                    {livePaper.comment}
                  </p>
                ) : (
                  <button
                    onClick={startEditingNote}
                    className='w-full text-left text-xs text-stone-400 italic hover:text-stone-600 transition px-3 py-2 border border-dashed border-app rounded-md'
                  >
                    Add a personal note for this paper...
                  </button>
                )}
              </section>

              {/* Keywords */}
              <section>
                <div className='flex items-center justify-between mb-2'>
                  <h3 className='text-sm font-semibold text-stone-900 inline-flex items-center gap-1.5'>
                    <Tag size={14} className='text-stone-500' />
                    Keywords
                    <span className='text-[11px] font-normal text-stone-400'>
                      ({keywords.length}/{MAX_PAPER_KEYWORDS})
                    </span>
                  </h3>
                </div>

                <div className='flex flex-wrap items-center gap-1.5'>
                  {keywords.map((kw) => (
                    <span
                      key={kw}
                      className='group inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] surface-muted text-stone-700 border border-app'
                    >
                      <span className='truncate max-w-[14ch]'>{kw}</span>
                      <button
                        onClick={() => removeKeyword(kw)}
                        className='text-stone-400 hover:text-danger transition'
                        aria-label={`Remove keyword ${kw}`}
                        title='Remove'
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}

                  {!keywordCapReached && (
                    <div className='inline-flex items-center gap-1'>
                      <input
                        type='text'
                        value={keywordDraft}
                        onChange={(e) =>
                          setKeywordDraft(
                            e.target.value.slice(0, MAX_PAPER_KEYWORD_LENGTH),
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            commitKeywordDraft();
                          } else if (
                            e.key === 'Backspace' &&
                            keywordDraft === '' &&
                            keywords.length > 0
                          ) {
                            // Quick deletion: backspace on empty input
                            // pops the last keyword. Common pattern in
                            // tag inputs; saves a click on the ×.
                            e.preventDefault();
                            removeKeyword(keywords[keywords.length - 1]);
                          }
                        }}
                        onBlur={commitKeywordDraft}
                        placeholder={
                          keywords.length === 0
                            ? 'Add a keyword and press Enter'
                            : 'Add another...'
                        }
                        maxLength={MAX_PAPER_KEYWORD_LENGTH}
                        className='px-2 py-0.5 text-[11px] border border-dashed border-app rounded-full bg-transparent focus-accent min-w-[8rem]'
                      />
                      {keywordDraft.trim() && (
                        <button
                          onClick={commitKeywordDraft}
                          className='p-0.5 text-stone-500 hover:text-stone-800 rounded transition'
                          title='Add keyword'
                        >
                          <Plus size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {keywordCapReached && (
                  <p className='mt-1 text-[11px] text-stone-400'>
                    Keyword limit reached. Remove one to add another.
                  </p>
                )}
              </section>
            </div>
          )}

          {/* Always-visible footer line — every detail modal carries
              the same low-key invitation to flag data issues. Sits at
              the bottom so it doesn't compete with primary content,
              but is reliably reachable from any paper view. */}
          {/* Report-flag dropdown — mirrors the SearchResults paper
              card's bottom-right flag. Collapsed by default to a bare
              flag icon pinned to the right so it stays out of the way
              of primary content; clicking it reveals the same
              "spot a problem" copy, the OpenAlex work id with a copy
              button, and the Submit / Mark-as-reported actions. */}
          <div className='mt-6 pt-3 border-t border-app'>
            <div className='flex justify-end'>
              <button
                type='button'
                onClick={toggleInfoPanel}
                aria-expanded={isInfoExpanded}
                aria-label='Report a data error to OpenAlex'
                title='Report a data error to OpenAlex'
                className={`p-1 inline-flex items-center rounded transition ${
                  isInfoExpanded
                    ? 'text-stone-700 bg-[var(--surface-muted)]'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                <Flag size={12} />
              </button>
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ease-in-out ${
                isInfoExpanded
                  ? 'max-h-56 opacity-100 mt-2'
                  : 'max-h-0 opacity-0'
              }`}
            >
              <div className='space-y-2'>
                <p className='text-xs text-stone-600 leading-snug'>
                  <span className='font-medium text-stone-800'>
                    Spot a problem with this paper?
                  </span>{' '}
                  Wrong author, missing PDF, garbled title, off citation
                  count? OpenAlex is open and improves with corrections from
                  researchers like you.
                </p>
                <div className='flex items-center gap-2 text-xs'>
                  <span className='text-stone-500'>ID:</span>
                  <code className='px-1.5 py-0.5 surface-muted rounded text-stone-600 font-mono text-[11px]'>
                    {workId}
                  </code>
                  <button
                    type='button'
                    onClick={copyWorkId}
                    className='p-0.5 text-stone-400 hover:text-stone-600 transition'
                    title='Copy Work ID'
                  >
                    {isCopied ? (
                      <Check size={12} className='text-success' />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
                <div className='flex items-center gap-3 pt-1'>
                  <a
                    href={PAPER_CORRECTION_FORM_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    onClick={handleReportClick}
                    className='inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-700 hover:underline transition'
                  >
                    <ExternalLink size={11} />
                    Submit correction
                  </a>
                  <button
                    type='button'
                    onClick={handleReportedToggle}
                    className={`inline-flex items-center gap-1 text-xs transition ${
                      isReported
                        ? 'text-success'
                        : 'text-stone-400 hover:text-stone-600'
                    }`}
                    title={
                      isReported ? 'Unmark as reported' : 'Mark as reported'
                    }
                  >
                    <CheckCircle
                      size={12}
                      className={
                        isReported
                          ? 'fill-[var(--success-foreground)] text-[var(--foreground-inverse)]'
                          : ''
                      }
                    />
                    <span>{isReported ? 'Reported' : 'Mark as reported'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
