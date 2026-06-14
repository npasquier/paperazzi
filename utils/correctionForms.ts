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
 * Google-Form `entry.<id>` field ids for prefilling OpenAlex's correction
 * form. They are null until filled in because the form is JavaScript-gated
 * (its `entry.*` ids aren't in the no-JS HTML) AND it's OpenAlex's form, so the
 * owner-only "Get pre-filled link" tool isn't available to us.
 *
 * HOW TO FIND EACH ID (no spam submission needed):
 *   1. Open the form, choose "Fix errors in the abstract text", click Next to
 *      reach the abstract page.
 *   2. Right-click each field's input/textarea → Inspect. Read the
 *      `name="entry.123456789"` attribute on the <input>/<textarea>.
 *        • email box       → email
 *        • "Is this your work?" radio → isYourWork (note exact option text)
 *        • edit-type radio  → editType (option text is "Fix errors in the
 *          abstract text")
 *        • Work ID box      → workId
 *        • abstract textarea→ abstract
 *   3. Paste the numbers below.
 *
 * Google Forms applies URL-prefilled values across ALL pages, so a single link
 * can prefill page 1 (email, radios, work id) and the later abstract page; the
 * user just clicks Next → Submit. Any field left null is simply not prefilled.
 */
export const CORRECTION_FORM_ENTRIES: {
  email: string | null;
  isYourWork: string | null;
  editType: string | null;
  workId: string | null;
  abstract: string | null;
} = {
  // Email is the form's built-in "collect email" field, not a custom
  // question, so it has no `entry.<id>`. It is instead prefilled with the
  // special `emailAddress=` query param (see buildPrefilledCorrectionUrl).
  email: null,
  isYourWork: '445519835',
  editType: '324017667',
  workId: '699100053',
  abstract: '1525251538',
};

/**
 * Default answers for the radio/email fields. Set your email once and it gets
 * prefilled every time. The radio option strings must match the form's option
 * labels exactly (case + punctuation).
 */
export const CORRECTION_FORM_ANSWERS = {
  // Prefilled into the form's collected-email field via `emailAddress=`. The
  // responder can still overwrite it. Set to '' to leave the field blank and
  // let Google auto-fill the signed-in user's address instead.
  email: 'nicolas.pasquier@inrae.fr' as string,
  isYourWork: 'No',
};

/**
 * The "What edit is needed to the work record?" radio (entry.324017667) on
 * OpenAlex's form. `editTypeOption` strings are copied verbatim from the live
 * form — they MUST match exactly (case + punctuation) or Google silently drops
 * the prefill. `pill` is the short label shown on the UI buttons.
 *
 * Ordered for the UI: the two most common fixes (title, abstract) and merge
 * come first, then the metadata fixes. `needsAbstract` flags the one type that
 * also prefills the abstract text box on the form's second page.
 */
export interface CorrectionType {
  id: string;
  pill: string;
  editTypeOption: string;
  needsAbstract?: boolean;
}

export const CORRECTION_TYPES: CorrectionType[] = [
  { id: 'title', pill: 'Title', editTypeOption: 'Fix the title' },
  {
    id: 'abstract',
    pill: 'Abstract',
    editTypeOption: 'Fix errors in the abstract text',
    needsAbstract: true,
  },
  {
    id: 'merge',
    pill: 'Duplicate',
    editTypeOption: 'Merge the work with a duplicate record',
  },
];

export const getCorrectionType = (id: string): CorrectionType | undefined =>
  CORRECTION_TYPES.find((t) => t.id === id);

/**
 * Build the correction-form URL, prefilling whichever fields are known.
 *
 * - `editType` is the exact radio option string (use a CORRECTION_TYPES entry's
 *   `editTypeOption`). Omit it for a generic "open the form" link that leaves
 *   the edit-type radio unselected.
 * - `email` is prefilled via Google's `emailAddress=` param (collected-email
 *   fields have no `entry.<id>`), defaulting to CORRECTION_FORM_ANSWERS.email.
 *
 * Falls back to the bare form URL when nothing is configured.
 */
export function buildPrefilledCorrectionUrl(opts: {
  workId: string;
  abstract?: string;
  email?: string;
  editType?: string;
}): string {
  const e = CORRECTION_FORM_ENTRIES;
  const pairs: Array<[string | null, string | undefined]> = [
    [e.isYourWork, CORRECTION_FORM_ANSWERS.isYourWork],
    [e.editType, opts.editType],
    [e.workId, normalizeId(opts.workId)],
    [e.abstract, opts.abstract],
  ];
  const params = pairs
    .filter(([id, val]) => id && val)
    .map(([id, val]) => `entry.${id}=${encodeURIComponent(val as string)}`);

  // Collected-email field: prefilled via the dedicated `emailAddress=` param.
  const email = opts.email ?? CORRECTION_FORM_ANSWERS.email;
  if (email) params.push(`emailAddress=${encodeURIComponent(email)}`);

  if (params.length === 0) return PAPER_CORRECTION_FORM_URL;
  const sep = PAPER_CORRECTION_FORM_URL.includes('?') ? '&' : '?';
  return `${PAPER_CORRECTION_FORM_URL}${sep}usp=pp_url&${params.join('&')}`;
}

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
    // Prefill the Work ID (and email/radios, if configured) even for the
    // generic "open the form" path.
    window.open(
      buildPrefilledCorrectionUrl({ workId }),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return copyPromise;
}

/**
 * Abstract-correction flow used by the curation dashboard. Opens the form with
 * every configured field prefilled (email, "is this your work", edit-type,
 * Work ID, and the abstract itself) and ALSO copies the abstract to the
 * clipboard as a fallback for when the abstract entry id isn't configured yet.
 *
 * The clipboard write is fired before `window.open` (no `await`) so the popup
 * keeps the click's user activation and isn't blocked.
 *
 * Resolves true when the clipboard write succeeded, false otherwise; the form
 * opens either way so the click is never a no-op.
 */
export function copyAbstractAndOpenCorrectionForm(
  workId: string,
  abstract: string,
): Promise<boolean> {
  const canUseClipboard =
    !!abstract &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.writeText;

  const copyPromise: Promise<boolean> = canUseClipboard
    ? navigator.clipboard
        .writeText(abstract)
        .then(() => true)
        .catch((err) => {
          console.error('Failed to copy abstract:', err);
          return false;
        })
    : Promise.resolve(false);

  if (typeof window !== 'undefined') {
    window.open(
      buildPrefilledCorrectionUrl({
        workId,
        abstract,
        editType: getCorrectionType('abstract')?.editTypeOption,
      }),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return copyPromise;
}

/**
 * Pill flow: open the correction form prefilled for a specific edit type
 * (Title, Abstract, Merge, …). Copies the most-paste-worthy value to the
 * clipboard as a convenience — the abstract for the abstract fix (its text box
 * is on the form's second page), otherwise the Work ID.
 *
 * The clipboard write is fired before `window.open` (no `await`) so the popup
 * keeps the click's user activation and isn't blocked. Resolves true when the
 * copy succeeded, false otherwise; the form opens either way.
 */
export function openCorrectionForm(
  workId: string,
  correctionTypeId: string,
  opts: { abstract?: string } = {},
): Promise<boolean> {
  const type = getCorrectionType(correctionTypeId);
  const abstract = type?.needsAbstract ? opts.abstract : undefined;
  const clipboardText = abstract || normalizeId(workId);

  const canUseClipboard =
    !!clipboardText &&
    typeof navigator !== 'undefined' &&
    !!navigator.clipboard?.writeText;

  const copyPromise: Promise<boolean> = canUseClipboard
    ? navigator.clipboard
        .writeText(clipboardText)
        .then(() => true)
        .catch((err) => {
          console.error('Failed to copy correction value:', err);
          return false;
        })
    : Promise.resolve(false);

  if (typeof window !== 'undefined') {
    window.open(
      buildPrefilledCorrectionUrl({
        workId,
        abstract,
        editType: type?.editTypeOption,
      }),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return copyPromise;
}
