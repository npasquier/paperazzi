// Static map of journal shortcuts → ISSN, used by the `#abbrev` autocomplete
// in the search bar. Editing this file is the single point of change when
// you want to add/remove a shortcut. Keys must be lowercase.
//
// Each value's `name` is shown in the dropdown and on the chip; the `issn`
// is what the existing journal filter pipeline expects in the URL's
// `journals=` param. Names are kept canonical (matching data/journals.ts)
// so the resulting chip label aligns with what the panel would show.

export interface JournalShortcut {
  abbrev: string; // lowercased key, also the `#abbrev` token
  name: string;
  issn: string;
}

export const JOURNAL_SHORTCUTS: Record<string, JournalShortcut> = {
  // ── Top 5 ────────────────────────────────────────────────────────────
  aer: { abbrev: 'aer', name: 'American Economic Review', issn: '0002-8282' },
  qje: {
    abbrev: 'qje',
    name: 'Quarterly Journal of Economics',
    issn: '0033-5533',
  },
  jpe: {
    abbrev: 'jpe',
    name: 'Journal of Political Economy',
    issn: '0022-3808',
  },
  ecma: { abbrev: 'ecma', name: 'Econometrica', issn: '0012-9682' },
  restud: {
    abbrev: 'restud',
    name: 'Review of Economic Studies',
    issn: '0034-6527',
  },

  // ── American Economic Journal series ─────────────────────────────────
  aejmacro: {
    abbrev: 'aejmacro',
    name: 'American Economic Journal: Macroeconomics',
    issn: '1945-7707',
  },
  aejmicro: {
    abbrev: 'aejmicro',
    name: 'American Economic Journal: Microeconomics',
    issn: '1945-7669',
  },
  aejapplied: {
    abbrev: 'aejapplied',
    name: 'American Economic Journal: Applied Economics',
    issn: '1945-7782',
  },
  aejpolicy: {
    abbrev: 'aejpolicy',
    name: 'American Economic Journal: Economic Policy',
    issn: '1945-7731',
  },

  // ── Top general / "second tier" ──────────────────────────────────────
  jeea: {
    abbrev: 'jeea',
    name: 'Journal of the European Economic Association',
    issn: '1542-4766',
  },
  restat: {
    abbrev: 'restat',
    name: 'Review of Economics and Statistics',
    issn: '0034-6535',
  },
  ej: { abbrev: 'ej', name: 'Economic Journal', issn: '0013-0133' },
  ier: {
    abbrev: 'ier',
    name: 'International Economic Review',
    issn: '0020-6598',
  },
  ms: {
    abbrev: 'ms',
    name: 'Management Science',
    issn: '0025-1909',
  },
  jel: {
    abbrev: 'jel',
    name: 'Journal of Economic Literature',
    issn: '0022-0515',
  },
  jep: {
    abbrev: 'jep',
    name: 'Journal of Economic Perspectives',
    issn: '0895-3309',
  },
  qe: { abbrev: 'qe', name: 'Quantitative Economics', issn: '1759-7331' },
  te: { abbrev: 'te', name: 'Theoretical Economics', issn: '1555-7561' },
  rand: {
    abbrev: 'rand',
    name: 'RAND Journal of Economics',
    issn: '0741-6261',
  },

  // ── Field journals ───────────────────────────────────────────────────
  jet: {
    abbrev: 'jet',
    name: 'Journal of Economic Theory',
    issn: '0022-0531',
  },
  jme: {
    abbrev: 'jme',
    name: 'Journal of Monetary Economics',
    issn: '0304-3932',
  },
  // Note: `jie` is reserved for the Journal of Industrial Economics (see
  // the Industrial Organization block below). The Journal of International
  // Economics is keyed under `jintec` to avoid the collision — both are
  // commonly called "JIE" in their respective subfields. But I am an IO guy so
  // I get to keep the `jie` shortcut for Journal of Industrial Economics 😎
  jintec: {
    abbrev: 'jintec',
    name: 'Journal of International Economics',
    issn: '0022-1996',
  },
  jpube: {
    abbrev: 'jpube',
    name: 'Journal of Public Economics',
    issn: '0047-2727',
  },
  jde: {
    abbrev: 'jde',
    name: 'Journal of Development Economics',
    issn: '0304-3878',
  },
  jhe: {
    abbrev: 'jhe',
    name: 'Journal of Health Economics',
    issn: '0167-6296',
  },
  jue: { abbrev: 'jue', name: 'Journal of Urban Economics', issn: '0094-1190' },
  jhr: {
    abbrev: 'jhr',
    name: 'Journal of Human Resources',
    issn: '0022-166X',
  },
  jole: {
    abbrev: 'jole',
    name: 'Journal of Labor Economics',
    issn: '0734-306X',
  },
  jeem: {
    abbrev: 'jeem',
    name: 'Journal of Environmental Economics and Management',
    issn: '0095-0696',
  },
  joe: {
    abbrev: 'joe',
    name: 'Journal of Econometrics',
    issn: '0304-4076',
  },

  // ── Industrial Organization ──────────────────────────────────────────
  // (`rand` is already in the "second tier" block above; listed here for
  // discoverability via the help popover's catalog.)
  jie: {
    abbrev: 'jie',
    name: 'Journal of Industrial Economics',
    issn: '0022-1821',
  },
  ijio: {
    abbrev: 'ijio',
    name: 'International Journal of Industrial Organization',
    issn: '0167-7187',
  },
  jems: {
    abbrev: 'jems',
    name: 'Journal of Economics and Management Strategy',
    issn: '1058-6407',
  },
  rio: {
    abbrev: 'rio',
    name: 'Review of Industrial Organization',
    issn: '0889-938X',
  },

  // ── Theory / behavioral ──────────────────────────────────────────────
  geb: {
    abbrev: 'geb',
    name: 'Games and Economic Behavior',
    issn: '0899-8256',
  },
  jebo: {
    abbrev: 'jebo',
    name: 'Journal of Economic Behavior and Organization',
    issn: '0167-2681',
  },
  ee: { abbrev: 'ee', name: 'Experimental Economics', issn: '1386-4157' },

  // ── Finance ──────────────────────────────────────────────────────────
  jf: { abbrev: 'jf', name: 'Journal of Finance', issn: '0022-1082' },
  jfe: {
    abbrev: 'jfe',
    name: 'Journal of Financial Economics',
    issn: '0304-405X',
  },
  rfs: {
    abbrev: 'rfs',
    name: 'Review of Financial Studies',
    issn: '0893-9454',
  },
  jbf: {
    abbrev: 'jbf',
    name: 'Journal of Banking and Finance',
    issn: '0378-4266',
  },
  mathfin: {
    abbrev: 'mathfin',
    name: 'Mathematical Finance',
    issn: '0960-1627',
  },
};

// Sorted list of all shortcuts, useful for displaying the catalog in the
// search-syntax help popover. Sorted alphabetically by abbreviation so the
// user can scan it predictably.
export const JOURNAL_SHORTCUTS_LIST: JournalShortcut[] = Object.values(
  JOURNAL_SHORTCUTS,
).sort((a, b) => a.abbrev.localeCompare(b.abbrev));

// Reverse lookup ISSN → abbreviation, built once at module load. The
// search-bar's journal chip uses this to render `#abbrev` instead of the
// (much longer) full journal name. Returns undefined for journals that
// were filter-added via the panel and aren't in our shortcut catalog —
// callers should fall back to name/issn in that case.
const ISSN_TO_ABBREV: Map<string, string> = new Map(
  JOURNAL_SHORTCUTS_LIST.map((j) => [j.issn, j.abbrev]),
);

export function abbrevForIssn(issn: string): string | undefined {
  return ISSN_TO_ABBREV.get(issn);
}

// Filter the shortcut map for an autocomplete prefix. Returns up to `limit`
// shortcuts whose abbreviation OR display name matches the prefix
// (case-insensitive). Abbreviation matches outrank name matches because
// the user typed `#`, signaling intent to use a known abbreviation.
export function searchJournalShortcuts(
  prefix: string,
  limit = 25,
): JournalShortcut[] {
  if (!prefix) return [];
  const needle = prefix.toLowerCase();
  const exact: JournalShortcut[] = [];
  const prefixMatch: JournalShortcut[] = [];
  const nameMatch: JournalShortcut[] = [];
  for (const j of Object.values(JOURNAL_SHORTCUTS)) {
    if (j.abbrev === needle) exact.push(j);
    else if (j.abbrev.startsWith(needle)) prefixMatch.push(j);
    else if (j.name.toLowerCase().includes(needle)) nameMatch.push(j);
  }
  return [...exact, ...prefixMatch, ...nameMatch].slice(0, limit);
}
