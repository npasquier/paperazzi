// Thin re-export of the async-loader's mapIssnsToJournals helper, kept at
// this filename for backward compat with existing imports. New code should
// prefer `mapIssnsToJournalsAsync` from `utils/loadJournals` directly.
//
// IMPORTANT: this is now async — callers that previously did
//   const journals = mapIssnsToJournals(issns);
// must do
//   const journals = await mapIssnsToJournalsAsync(issns);
// (or use the renamed export). The synchronous version was removed because
// it forced data/journals.ts into every client bundle that touched it.

export { mapIssnsToJournalsAsync as default } from './loadJournals';
