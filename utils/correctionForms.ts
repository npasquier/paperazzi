// Centralised list of correction-form / OpenAlex contribution URLs.
// Single source of truth so we don't hard-code different Google Form
// links in different components — every "Submit correction" entry
// point should pull from here.

import { normalizeId } from '@/utils/normalizeId';

/**
 * Per-paper correction form (Google Form). Submitted reports are
 * triaged and forwarded to OpenAlex by the project maintainer.
 */
export const PAPER_CORRECTION_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScUcNZdqOBFxVJ0oihjeHFilm9IqqWKQY4WDmmqgxUNGr3R1g/viewform';

/**
 * Per-author correction form (Google Form). Same triage flow as the
 * paper form but for misattributed authorships, ORCID issues, etc.
 */
export const AUTHOR_CORRECTION_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeHpt3yWbWoB5MK1K6wVWThI5fglZzk-GPniaih0JT_rCMdYA/viewform';

/**
 * Official OpenAlex docs page for fixing errors. Used as the
 * "learn-more" link from the About / Help pages — it explains the
 * full correction workflow without committing the user to a form.
 */
export const OPENALEX_FIX_ERRORS_URL =
  'https://help.openalex.org/hc/en-us/articles/27714298573719-Fix-errors-in-OpenAlex';

/**
 * Strip the OpenAlex URL prefix from a paper id so the user is left
 * with the bare work id (e.g. `W2741809807`).
 */
export const toOpenAlexWorkId = (paperId: string): string =>
  normalizeId(paperId);

/**
 * Copy the OpenAlex work id to the clipboard and open the correction
 * form in a new tab so the user can paste the id into the form.
 *
 * The clipboard write is fired synchronously (without `await`) before
 * `window.open` so the popup still counts as part of the click's user
 * activation — `await`-ing first would lose the gesture in some
 * browsers and trigger the popup blocker.
 *
 * Returns a promise that resolves to `true` when the clipboard write
 * succeeded, `false` otherwise (insecure context, denied permission,
 * empty id, …). The form opens either way so the user is never stuck
 * with a no-op click.
 */
export function copyWorkIdAndOpenCorrectionForm(
  workId: string,
): Promise<boolean> {
  const canUseClipboard =
    !!workId &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.writeText;

  const copyPromise: Promise<boolean> = canUseClipboard
    ? navigator.clipboard
        .writeText(workId)
        .then(() => true)
        .catch((err) => {
          console.error('Failed to copy work ID:', err);
          return false;
        })
    : Promise.resolve(false);

  if (typeof window !== 'undefined') {
    window.open(PAPER_CORRECTION_FORM_URL, '_blank', 'noopener,noreferrer');
  }

  return copyPromise;
}
