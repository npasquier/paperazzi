// Shared types for the rankings editor module (split out of the old
// single-file RankingsEditor in the 2026-06 L2 decomposition).

import type { RankingScheme } from '@/types/interfaces';

export type TabId = 'info' | 'journals' | 'tiers' | 'domains';

/**
 * The single mutation primitive the editor exposes to its tabs: clone
 * the active scheme, apply the recipe, validate, save. Defined in
 * RankingsEditor.tsx; typed here so the tab components don't have to
 * import from the orchestrator (avoids an import cycle).
 */
export type UpdateScheme = (recipe: (draft: RankingScheme) => void) => void;
