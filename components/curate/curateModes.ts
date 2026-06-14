// Curation modes — each "mechanism" the dashboard can run.
//
// A mode bundles everything that differs between the kinds of OpenAlex problem
// we triage: how to FIND candidates (a browser-side OpenAlex scan), an optional
// per-row PHASE 2 step (recover an abstract), and which OpenAlex correction-form
// edit type the "Submit correction" button should use.
//
// The dashboard component (CurateDashboard) is mode-agnostic: it reads a
// ModeConfig and drives the generic scan → review → submit flow.

import { normalizeId } from '@/utils/normalizeId';
import { withMailto } from '@/utils/openAlexClient';
import cleanHtml from '@/utils/cleanHtml';

export type CurateMode = 'abstract' | 'duplicate';

// Generic per-row outcome of phase 2.
//   idle    — not run yet
//   working — request in flight
//   ok      — phase 2 produced a usable result (abstract found)
//   fail    — phase 2 found nothing (no abstract anywhere)
//   error   — request itself failed
export type RowStatus = 'idle' | 'working' | 'ok' | 'fail' | 'error';

export interface ScanRow {
  workId: string;
  doi: string | null;
  title: string;
  year: number | null;
  /** Number of authorships on the work (null when not fetched). */
  authorCount?: number | null;
  selected: boolean;
  status: RowStatus;
  /** Recovered abstract text. */
  result?: string;
  source?: string;
  /** Duplicate grouping (set only in 'duplicate' mode). */
  groupKey?: string;
  groupSize?: number;
}

export type Candidate = Pick<
  ScanRow,
  'workId' | 'doi' | 'title' | 'year' | 'authorCount' | 'groupKey' | 'groupSize'
>;

interface RawListWork {
  id: string;
  doi: string | null;
  title: string | null;
  publication_year: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: unknown[];
}

export interface ScanOpts {
  issn: string;
  fromYear: number;
  toYear: number;
  /** Cap on candidates returned. */
  cap: number;
  shouldStop: () => boolean;
  /** Reports how many OpenAlex records have been scanned so far. */
  onProgress?: (scanned: number) => void;
}

export interface ModeConfig {
  id: CurateMode;
  tab: string;
  heading: string;
  blurb: string;
  /** Header for the mode-specific result column. */
  resultHeader: string;
  /** correctionForms.ts CORRECTION_TYPES id used by "Submit correction". */
  correctionTypeId: string;
  scan: (opts: ScanOpts) => Promise<Candidate[]>;
  /** Optional per-row step (recover). Absent for 'duplicate'. */
  phase2?: {
    label: string; // idle button label, e.g. "Recover"
    activeLabel: string; // progress verb, e.g. "Recovering"
    run: (row: ScanRow) => Promise<Partial<ScanRow>>;
  };
}

const ABSTRACT_SELECT =
  'id,doi,title,publication_year,abstract_inverted_index,authorships';
const LIST_SELECT = 'id,doi,title,publication_year';
// Upper bound on records paged through for the duplicate scan, so a journal
// with no matches can't spin forever.
const SCAN_BUDGET = 6000;

function baseFilter(issn: string, fromYear: number, toYear: number): string {
  return (
    `primary_location.source.issn:${issn},has_doi:true,` +
    `type:article,is_paratext:false,` +
    `from_publication_date:${fromYear}-01-01,to_publication_date:${toYear}-12-31`
  );
}

function cleanDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
}

/** Normalise a title for duplicate grouping: lowercase, strip punctuation,
 *  collapse whitespace. */
function normTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Page through a journal's works, yielding raw records until the cursor is
 *  exhausted, the budget is hit, or the caller asks to stop. */
async function* pageWorks(
  filter: string,
  select: string,
  shouldStop: () => boolean,
  onProgress?: (scanned: number) => void,
  budget = SCAN_BUDGET,
): AsyncGenerator<RawListWork> {
  let cursor = '*';
  let scanned = 0;
  while (cursor && !shouldStop() && scanned < budget) {
    const url = withMailto(
      `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}` +
        `&select=${select}&per-page=200&cursor=${encodeURIComponent(cursor)}`,
    );
    const res = await fetch(url);
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
    const page = (await res.json()) as {
      results: RawListWork[];
      meta: { next_cursor: string | null };
    };
    for (const w of page.results) {
      scanned++;
      yield w;
    }
    onProgress?.(scanned);
    cursor = page.meta.next_cursor ?? '';
  }
}

// ── Abstract: works with a DOI but no abstract ──────────────────────────────
async function scanMissingAbstract(opts: ScanOpts): Promise<Candidate[]> {
  const { issn, fromYear, toYear, cap, shouldStop, onProgress } = opts;
  const base = baseFilter(issn, fromYear, toYear);
  const out: Candidate[] = [];
  let useAbstractFilter = true;
  let cursor = '*';
  let scanned = 0;

  while (out.length < cap && cursor && !shouldStop()) {
    const filter = useAbstractFilter ? `${base},has_abstract:false` : base;
    const url = withMailto(
      `https://api.openalex.org/works?filter=${encodeURIComponent(filter)}` +
        `&select=${ABSTRACT_SELECT}&per-page=200&cursor=${encodeURIComponent(cursor)}`,
    );
    let page: { results: RawListWork[]; meta: { next_cursor: string | null } };
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
      page = (await res.json()) as typeof page;
    } catch (err) {
      if (useAbstractFilter) {
        useAbstractFilter = false; // filter rejected → client-side null check
        cursor = '*';
        continue;
      }
      throw err;
    }
    for (const w of page.results) {
      scanned++;
      if (w.abstract_inverted_index != null || !w.doi) continue;
      out.push({
        workId: normalizeId(w.id),
        doi: cleanDoi(w.doi),
        title: cleanHtml(w.title) || '(untitled)',
        year: w.publication_year,
        authorCount: Array.isArray(w.authorships) ? w.authorships.length : null,
      });
      if (out.length >= cap) break;
    }
    onProgress?.(scanned);
    cursor = page.meta.next_cursor ?? '';
  }
  return out;
}

// ── Duplicate: works sharing a normalised title + year ──────────────────────
async function scanDuplicates(opts: ScanOpts): Promise<Candidate[]> {
  const { issn, fromYear, toYear, cap, shouldStop, onProgress } = opts;
  const filter = baseFilter(issn, fromYear, toYear);

  const seen: Array<{
    workId: string;
    doi: string | null;
    title: string;
    year: number | null;
    key: string;
  }> = [];
  for await (const w of pageWorks(filter, LIST_SELECT, shouldStop, onProgress)) {
    const title = cleanHtml(w.title);
    if (!title) continue;
    const key = `${normTitle(title)}__${w.publication_year ?? '?'}`;
    seen.push({
      workId: normalizeId(w.id),
      doi: w.doi ? cleanDoi(w.doi) : null,
      title,
      year: w.publication_year,
      key,
    });
  }

  // Keep only keys that occur 2+ times, preserving each group together.
  const counts = new Map<string, number>();
  for (const r of seen) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);

  const groups = new Map<string, Candidate[]>();
  for (const r of seen) {
    const size = counts.get(r.key) ?? 0;
    if (size < 2) continue;
    const arr = groups.get(r.key) ?? [];
    arr.push({
      workId: r.workId,
      doi: r.doi,
      title: r.title,
      year: r.year,
      groupKey: r.key,
      groupSize: size,
    });
    groups.set(r.key, arr);
  }

  // Flatten, capping by number of rows but never splitting a duplicate set.
  const out: Candidate[] = [];
  for (const arr of groups.values()) {
    if (out.length + arr.length > cap && out.length > 0) break;
    out.push(...arr);
  }
  return out;
}

// ── Phase-2 runner: recover an abstract ─────────────────────────────────────
async function recoverAbstractRow(row: ScanRow): Promise<Partial<ScanRow>> {
  if (!row.doi) return { status: 'fail', result: undefined, source: undefined };
  const res = await fetch(
    `/api/recover-abstract?doi=${encodeURIComponent(row.doi)}`,
  );
  const data = (await res.json()) as {
    found?: boolean;
    abstract?: string;
    source?: string;
  };
  return data.found && data.abstract
    ? { status: 'ok', result: data.abstract, source: data.source }
    : { status: 'fail', result: undefined, source: undefined };
}

export const MODES: ModeConfig[] = [
  {
    id: 'abstract',
    tab: 'Abstract missing',
    heading: 'Abstract missing',
    blurb:
      'Find papers with a DOI but no abstract in OpenAlex. Filter out the items that aren’t really articles, recover the abstract for the genuine gaps, then submit it to the correction form. Nothing is submitted automatically.',
    resultHeader: 'Abstract',
    correctionTypeId: 'abstract',
    scan: scanMissingAbstract,
    phase2: {
      label: 'Recover',
      activeLabel: 'Recovering',
      run: recoverAbstractRow,
    },
  },
  {
    id: 'duplicate',
    tab: 'Duplicates',
    heading: 'Duplicate records',
    blurb:
      'Find works in the journal that share the same title and year — likely duplicate OpenAlex records. Review each group, then open the merge-correction form for the extra copies.',
    resultHeader: 'Duplicate group',
    correctionTypeId: 'merge',
    scan: scanDuplicates,
  },
];

export const getMode = (id: CurateMode): ModeConfig =>
  MODES.find((m) => m.id === id) ?? MODES[0];
