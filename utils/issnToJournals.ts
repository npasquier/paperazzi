import journalsList from '@/data/journals';

function mapIssnsToJournals(issns: string[]) {
  return issns
    .map(issn => journalsList.find(j => j.issn === issn))
    .filter(Boolean) as typeof journalsList;
}

export default mapIssnsToJournals;
