export const ECON_DOMAINS = [
  { key: 'GEN', label: 'General' },
  { key: 'OrgInd', label: 'Ind. Org.' },
  { key: 'EcoDroit', label: 'Law & Econ' },
  { key: 'AgrEnEnv', label: 'Agri/Energy/Env' },
  { key: 'EcoPub', label: 'Public' },
  { key: 'MKG', label: 'Marketing' },
  { key: 'Metrie', label: 'Econometrics' },
  { key: 'Macro', label: 'Macro' },
  { key: 'ThEco', label: 'Theory' },
  { key: 'TravPop', label: 'Labor/Pop' },
  { key: 'Innov', label: 'Innovation' },
  { key: 'HPEA', label: 'History/Phil.' },
  { key: 'RO', label: 'Oper. Research' },
  { key: 'SANT', label: 'Health' },
  { key: 'Spatiale', label: 'Spatial/Urban' },
  { key: 'CPT', label: 'Accounting' },
  { key: 'DevTrans', label: 'Dev/Transition' },
  { key: 'Fin', label: 'Finance' },
  { key: 'GRH', label: 'HR/OrgBehavior' },
  { key: 'LOG', label: 'Logistics' },
  { key: 'MgPub', label: 'Public Mgmt' },
  { key: 'SI', label: 'Info Systems' },
  { key: 'StratOrg', label: 'Strategy/Org' },
] as const;

export const ECON_CATEGORIES = [1, 2, 3, 4] as const;

import journals from './journals';

// Built-in wide presets shown as pills in the Journals > Wide filter subsection.
// A preset is either a (categories, domains) combo, or an explicit ISSN whitelist
// (used when the desired set isn't expressible as cat/dom — e.g. "Top 5").
export interface EconPreset {
  id: string;
  name: string;
  categories: readonly number[];
  domains: readonly string[];
  issns?: readonly string[]; // when set, overrides cat/dom server-side
}

// Top 5 — the canonical "top five" general-interest economics journals:
// American Economic Review, Econometrica, Journal of Political Economy,
// Quarterly Journal of Economics, Review of Economic Studies.
// Hardcoded by ISSN (rather than derived from journals.ts ordering) so this
// preset's meaning is independent of category/domain bookkeeping.
export const TOP5_ISSNS: readonly string[] = [
  '0002-8282', // American Economic Review
  '0012-9682', // Econometrica
  '0022-3808', // Journal of Political Economy
  '0033-5533', // Quarterly Journal of Economics
  '0034-6527', // Review of Economic Studies
];

export const ECON_PRESETS: readonly EconPreset[] = [
  {
    id: 'all',
    name: 'All',
    categories: [],
    domains: [],
  },
  {
    id: 'top5gen',
    name: 'Top 5',
    categories: [],
    domains: [],
    issns: TOP5_ISSNS,
  },
];
