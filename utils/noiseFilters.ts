// Noise filters — heuristics for spotting OpenAlex "works" that are typed as
// research articles but really aren't (front matter, referee acknowledgments,
// editorial boards, …). These slip past OpenAlex's own `is_paratext` flag, so
// they show up in an "abstract missing" scan even though they legitimately
// have no abstract.
//
// Each rule is independently toggleable in the UI so the user decides which
// categories to hide. Kept here (not in a component) so the same rules can be
// reused elsewhere (e.g. search results) without duplicating the regexes.

export interface NoiseTarget {
  title: string;
  /** Number of authorships on the work, when known. */
  authorCount?: number | null;
}

export interface NoiseRule {
  id: string;
  label: string;
  /** Short hint shown under the toggle. */
  hint: string;
  test: (t: NoiseTarget) => boolean;
}

export const NOISE_RULES: NoiseRule[] = [
  {
    id: 'frontmatter',
    label: 'Front / back matter',
    hint: 'Front Matter, Back Matter, cover pages',
    test: (t) => /\b(front|back)\s*matter\b|\bcover\s*(page|art)\b/i.test(t.title),
  },
  {
    id: 'referees',
    label: 'Referee acknowledgments',
    hint: 'Acknowledgment / list of referees',
    test: (t) =>
      /acknowledg\w*\s+(of\s+)?(the\s+)?referees|list of referees|report of (the )?referees|referee report/i.test(
        t.title,
      ),
  },
  {
    id: 'editorial',
    label: 'Editorial board / masthead',
    hint: 'Editorial board, masthead, staff lists',
    test: (t) => /editorial board|masthead|editorial staff/i.test(t.title),
  },
  {
    id: 'toc',
    label: 'Contents / index',
    hint: 'Table of contents, index, "in this issue"',
    test: (t) =>
      /table of contents|^\s*contents\s*$|^\s*index\s*$|\bin this issue\b/i.test(
        t.title,
      ),
  },
  {
    id: 'issueinfo',
    label: 'Issue / volume information',
    hint: 'Volume info, issue information, mastfront',
    test: (t) =>
      /\b(volume|issue)\b[^.]*\binformation\b|^\s*(volume|issue)\s+\d+/i.test(
        t.title,
      ),
  },
  {
    id: 'auditor',
    label: 'Auditor / annual reports',
    hint: "Independent auditor reports, annual reports",
    test: (t) =>
      /report of (the )?independent auditor|auditor'?s report|\bannual report\b/i.test(
        t.title,
      ),
  },
  {
    id: 'errata',
    label: 'Errata / corrigenda',
    hint: 'Errata, corrigenda, retractions',
    test: (t) => /^\s*errat(a|um)\b|\bcorrigend\w+|\bretraction\b/i.test(t.title),
  },
  {
    id: 'lectures',
    label: 'Prize lectures / addresses',
    hint: 'Nobel lectures, presidential addresses',
    test: (t) =>
      /nobel (prize )?lecture|prize lecture|presidential address|\beditorial\b\s*$/i.test(
        t.title,
      ),
  },
  {
    id: 'noauthors',
    label: 'No authors listed',
    hint: 'Works OpenAlex has with zero authors',
    test: (t) => t.authorCount === 0,
  },
  {
    id: 'untitled',
    label: 'Untitled',
    hint: 'No usable title',
    test: (t) => !t.title || /^\(?(untitled|no title)\)?$/i.test(t.title.trim()),
  },
];

/** Default state: hide every noise category. */
export function defaultNoiseHidden(): Record<string, boolean> {
  return Object.fromEntries(NOISE_RULES.map((r) => [r.id, true]));
}

/** True if the target matches any rule the user has chosen to hide. */
export function isHiddenNoise(
  t: NoiseTarget,
  hidden: Record<string, boolean>,
): boolean {
  return NOISE_RULES.some((r) => hidden[r.id] && r.test(t));
}

/** Ids of every rule that matches the target (regardless of hide state). */
export function matchingNoiseRules(t: NoiseTarget): string[] {
  return NOISE_RULES.filter((r) => r.test(t)).map((r) => r.id);
}
