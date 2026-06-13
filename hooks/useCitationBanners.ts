'use client';

// Citation drill-down banner data, extracted from SearchResults
// (2026-06 audit, L2 decomposition). When the URL carries a
// citing / referencedBy / citingAll / referencesAll constraint, the
// page shows a banner naming the focal paper(s); this hook fetches
// their metadata. `fetchWorkAsPaper` folds in the OpenAlex→Paper
// mapping and per-call error handling.

import { useEffect, useState } from 'react';
import type { Paper } from '@/types/interfaces';
import { fetchWorkAsPaper } from '@/utils/openAlexClient';

export function useCitationBanners({
  citing,
  citingAll,
  referencedBy,
  referencesAll,
}: {
  citing?: string;
  citingAll?: string[];
  referencedBy?: string;
  referencesAll?: string[];
}) {
  const [citingPaper, setCitingPaper] = useState<Paper | null>(null);
  const [loadingCitingPaper, setLoadingCitingPaper] = useState(false);
  const [citingAllPapers, setCitingAllPapers] = useState<Paper[]>([]);
  const [loadingCitingAllPapers, setLoadingCitingAllPapers] = useState(false);
  const [referencedByPaper, setReferencedByPaper] = useState<Paper | null>(
    null,
  );
  const [loadingReferencedByPaper, setLoadingReferencedByPaper] =
    useState(false);
  const [referencesAllPapers, setReferencesAllPapers] = useState<Paper[]>([]);
  const [loadingReferencesAllPapers, setLoadingReferencesAllPapers] =
    useState(false);

  // Clear stale banner data the moment a constraint is REMOVED —
  // adjust-state-during-render (the React-sanctioned replacement for
  // synchronous setState-in-effect, which the React 19 compiler lint
  // flags). The effects below then only handle the fetch path.
  const [prevCiting, setPrevCiting] = useState(citing);
  if (prevCiting !== citing) {
    setPrevCiting(citing);
    if (!citing) setCitingPaper(null);
  }
  const [prevReferencedBy, setPrevReferencedBy] = useState(referencedBy);
  if (prevReferencedBy !== referencedBy) {
    setPrevReferencedBy(referencedBy);
    if (!referencedBy) setReferencedByPaper(null);
  }
  const [prevCitingAll, setPrevCitingAll] = useState(citingAll);
  if (prevCitingAll !== citingAll) {
    setPrevCitingAll(citingAll);
    if (!citingAll || citingAll.length === 0) setCitingAllPapers([]);
  }
  const [prevReferencesAll, setPrevReferencesAll] = useState(referencesAll);
  if (prevReferencesAll !== referencesAll) {
    setPrevReferencesAll(referencesAll);
    if (!referencesAll || referencesAll.length === 0)
      setReferencesAllPapers([]);
  }

  // Fetch citing paper
  useEffect(() => {
    if (!citing) return;
    // Setting the loading flag at fetch start is the standard data-
    // fetching-in-effect pattern (per React docs); the compiler lint
    // can't distinguish it from a derived-state reset, so opt out here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCitingPaper(true);
    fetchWorkAsPaper(citing)
      .then(setCitingPaper)
      .finally(() => setLoadingCitingPaper(false));
  }, [citing]);

  // Fetch referencedBy paper
  useEffect(() => {
    if (!referencedBy) return;
    // Setting the loading flag at fetch start is the standard data-
    // fetching-in-effect pattern (per React docs); the compiler lint
    // can't distinguish it from a derived-state reset, so opt out here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingReferencedByPaper(true);
    fetchWorkAsPaper(referencedBy)
      .then(setReferencedByPaper)
      .finally(() => setLoadingReferencedByPaper(false));
  }, [referencedBy]);

  // Fetch citingAll papers
  useEffect(() => {
    if (!citingAll || citingAll.length === 0) return;
    // Setting the loading flag at fetch start is the standard data-
    // fetching-in-effect pattern (per React docs); the compiler lint
    // can't distinguish it from a derived-state reset, so opt out here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCitingAllPapers(true);
    Promise.all(citingAll.map((id) => fetchWorkAsPaper(id)))
      .then((papers) =>
        setCitingAllPapers(papers.filter((p): p is Paper => p !== null)),
      )
      .finally(() => setLoadingCitingAllPapers(false));
  }, [citingAll]);

  // Fetch referencesAll papers
  useEffect(() => {
    if (!referencesAll || referencesAll.length === 0) return;
    // Setting the loading flag at fetch start is the standard data-
    // fetching-in-effect pattern (per React docs); the compiler lint
    // can't distinguish it from a derived-state reset, so opt out here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingReferencesAllPapers(true);
    Promise.all(referencesAll.map((id) => fetchWorkAsPaper(id)))
      .then((papers) =>
        setReferencesAllPapers(papers.filter((p): p is Paper => p !== null)),
      )
      .finally(() => setLoadingReferencesAllPapers(false));
  }, [referencesAll]);

  return {
    citingPaper,
    loadingCitingPaper,
    citingAllPapers,
    loadingCitingAllPapers,
    referencedByPaper,
    loadingReferencedByPaper,
    referencesAllPapers,
    loadingReferencesAllPapers,
  };
}
