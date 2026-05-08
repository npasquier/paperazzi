import cleanHtml from '@/utils/cleanHtml';
import { normalizeId } from '@/utils/normalizeId';
import { MAX_PINS, Paper, PinGroup } from '@/types/interfaces';

export const PIN_COLLECTION_TRANSFER_FORMAT = 'paperazzi.collection';
export const PIN_COLLECTION_TRANSFER_VERSION = 1;
export const PIN_COLLECTION_TRANSFER_MIME =
  'application/vnd.paperazzi.collection+json';
export const PIN_COLLECTION_TRANSFER_SUFFIX = '.paperazzi-collection.json';

export interface PinCollectionTransferFile {
  format: typeof PIN_COLLECTION_TRANSFER_FORMAT;
  version: typeof PIN_COLLECTION_TRANSFER_VERSION;
  app: 'paperazzi';
  exportedAt: string;
  collection: {
    name: string;
    papers: Paper[];
    groups: PinGroup[];
  };
}

export interface ImportedPinCollection {
  name: string;
  papers: Paper[];
  groups: PinGroup[];
}

type ImportParseResult =
  | { ok: true; data: ImportedPinCollection }
  | { ok: false; error: string };

function coerceString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function coerceNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizePaper(raw: unknown): Paper | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const normalizedId = normalizeId(coerceString(candidate.id).trim());
  if (!normalizedId) return null;

  const authors = Array.isArray(candidate.authors)
    ? candidate.authors
        .filter((author): author is string => typeof author === 'string')
        .map((author) => author.trim())
        .filter(Boolean)
    : [];

  const issns = Array.isArray(candidate.issns)
    ? candidate.issns
        .filter((issn): issn is string => typeof issn === 'string')
        .map((issn) => issn.trim())
        .filter(Boolean)
    : undefined;

  const referencedWorks = Array.isArray(candidate.referenced_works)
    ? candidate.referenced_works
        .filter((id): id is string => typeof id === 'string')
        .map((id) => normalizeId(id.trim()))
        .filter(Boolean)
    : undefined;

  return {
    id: normalizedId,
    title: cleanHtml(coerceString(candidate.title, 'Untitled paper')),
    authors,
    publication_year: coerceNumber(candidate.publication_year, 0),
    journal_name: coerceString(candidate.journal_name, 'Unknown'),
    doi:
      typeof candidate.doi === 'string' && candidate.doi.trim()
        ? candidate.doi
        : undefined,
    pdf_url:
      typeof candidate.pdf_url === 'string' && candidate.pdf_url.trim()
        ? candidate.pdf_url
        : undefined,
    cited_by_count: coerceNumber(candidate.cited_by_count, 0),
    referenced_works_count:
      typeof candidate.referenced_works_count === 'number' &&
      Number.isFinite(candidate.referenced_works_count)
        ? candidate.referenced_works_count
        : undefined,
    abstract: coerceString(candidate.abstract),
    issns,
    referenced_works: referencedWorks,
  };
}

function normalizeGroups(rawGroups: unknown, papers: Paper[]): PinGroup[] {
  if (!Array.isArray(rawGroups)) return [];

  const paperIds = new Set(papers.map((paper) => normalizeId(paper.id)));
  const assignedPaperIds = new Set<string>();
  const usedGroupIds = new Set<string>();

  return rawGroups.flatMap((rawGroup, index) => {
    if (!rawGroup || typeof rawGroup !== 'object') return [];
    const candidate = rawGroup as Record<string, unknown>;
    const preferredId = coerceString(candidate.id).trim() || `group-${index + 1}`;

    let groupId = preferredId;
    let duplicateCounter = 2;
    while (usedGroupIds.has(groupId)) {
      groupId = `${preferredId}-${duplicateCounter}`;
      duplicateCounter++;
    }
    usedGroupIds.add(groupId);

    const seenWithinGroup = new Set<string>();
    const paperIdsInGroup = Array.isArray(candidate.paperIds)
      ? candidate.paperIds
          .filter((id): id is string => typeof id === 'string')
          .map((id) => normalizeId(id.trim()))
          .filter((id) => {
            if (!id || !paperIds.has(id)) return false;
            if (seenWithinGroup.has(id) || assignedPaperIds.has(id)) {
              return false;
            }
            seenWithinGroup.add(id);
            assignedPaperIds.add(id);
            return true;
          })
      : [];

    return [
      {
        id: groupId,
        name: coerceString(candidate.name, `Group ${index + 1}`).trim() ||
          `Group ${index + 1}`,
        paperIds: paperIdsInGroup,
      },
    ];
  });
}

export function buildCollectionTransfer(
  name: string,
  papers: Paper[],
  groups: PinGroup[],
): PinCollectionTransferFile {
  return {
    format: PIN_COLLECTION_TRANSFER_FORMAT,
    version: PIN_COLLECTION_TRANSFER_VERSION,
    app: 'paperazzi',
    exportedAt: new Date().toISOString(),
    collection: {
      name: name.trim() || 'Library',
      papers: papers.map((paper) => ({
        ...paper,
        id: normalizeId(paper.id),
        title: cleanHtml(paper.title),
      })),
      groups: groups.map((group) => ({
        ...group,
        paperIds: group.paperIds.map((id) => normalizeId(id)),
      })),
    },
  };
}

export function serializeCollectionTransfer(
  payload: PinCollectionTransferFile,
): string {
  return JSON.stringify(payload, null, 2);
}

export function buildCollectionTransferFilename(name: string): string {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'collection';
  return `${slug}${PIN_COLLECTION_TRANSFER_SUFFIX}`;
}

export function parseCollectionTransferText(raw: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      error: 'That file is not valid JSON.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: 'That file does not look like a Paperazzi collection export.',
    };
  }

  const payload = parsed as Record<string, unknown>;
  if (payload.format !== PIN_COLLECTION_TRANSFER_FORMAT) {
    return {
      ok: false,
      error: 'That file is not a Paperazzi collection export.',
    };
  }

  if (payload.version !== PIN_COLLECTION_TRANSFER_VERSION) {
    return {
      ok: false,
      error: 'This Paperazzi collection file uses an unsupported version.',
    };
  }

  const rawCollection = payload.collection;
  if (!rawCollection || typeof rawCollection !== 'object') {
    return {
      ok: false,
      error: 'That export is missing its collection data.',
    };
  }

  const collection = rawCollection as Record<string, unknown>;
  const rawPapers = Array.isArray(collection.papers) ? collection.papers : null;
  if (!rawPapers) {
    return {
      ok: false,
      error: 'That export is missing its pinned papers list.',
    };
  }

  const uniquePapers: Paper[] = [];
  const seenPaperIds = new Set<string>();
  for (const rawPaper of rawPapers) {
    const paper = normalizePaper(rawPaper);
    if (!paper) continue;
    if (seenPaperIds.has(paper.id)) continue;
    seenPaperIds.add(paper.id);
    uniquePapers.push(paper);
  }

  if (uniquePapers.length > MAX_PINS) {
    return {
      ok: false,
      error: `This export has ${uniquePapers.length} pinned papers, but Paperazzi collections can hold at most ${MAX_PINS}.`,
    };
  }

  const groups = normalizeGroups(collection.groups, uniquePapers);

  return {
    ok: true,
    data: {
      name: coerceString(collection.name, 'Imported collection').trim() ||
        'Imported collection',
      papers: uniquePapers,
      groups,
    },
  };
}

export async function readCollectionImportFile(
  file: File,
): Promise<ImportParseResult> {
  const raw = await file.text();
  return parseCollectionTransferText(raw);
}
