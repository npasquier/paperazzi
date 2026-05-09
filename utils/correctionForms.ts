// Centralised list of correction-form / OpenAlex contribution URLs.
// Single source of truth so we don't hard-code different Google Form
// links in different components — every "Submit correction" entry
// point should pull from here.

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
