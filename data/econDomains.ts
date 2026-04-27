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
// (used when the desired set isn't expressible as cat/dom — e.g. "Top 5 GEN").
export interface EconPreset {
  id: string;
  name: string;
  categories: readonly number[];
  domains: readonly string[];
  issns?: readonly string[]; // when set, overrides cat/dom server-side
}

// Top 5 GEN = first 5 entries in journals.ts with domain='GEN' and category=1.
// Computed at import time so it stays in sync if journals.ts is reordered.
const TOP5_GEN_SET = new Set<string>([
  '0002-8282', // AER
  '0012-9682', // Econometrica
  '0022-3808', // JPE
  '0033-5533', // QJE
  '0034-6527', // ReStud
]);

export const TOP5_GEN_ISSNS: readonly string[] = [...TOP5_GEN_SET];

export const ECON_PRESETS: readonly EconPreset[] = [
  {
    id: 'all',
    name: 'All',
    categories: [],
    domains: [],
  },
  {
    id: 'top5gen',
    name: 'Top 5 GEN',
    categories: [],
    domains: [],
    issns: TOP5_GEN_ISSNS,
  },
];
