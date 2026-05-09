import cleanHtml from '@/utils/cleanHtml';
import { normalizeId } from '@/utils/normalizeId';
import {
  MAX_PAPER_COMMENT_LENGTH,
  MAX_PAPER_KEYWORD_LENGTH,
  MAX_PAPER_KEYWORDS,
  MAX_PINS,
  Paper,
  PinGroup,
} from '@/types/interfaces';

export const PIN_COLLECTION_TRANSFER_FORMAT = 'paperazzi.collection';
export const PIN_COLLECTION_TRANSFER_VERSION = 1;
export const PIN_COLLECTION_TRANSFER_MIME =
  'application/vnd.paperazzi.collection+json';
export const PIN_COLLECTION_TRANSFER_SUFFIX = '.paperazzi-collection.json';

// "Library" exports — the whole set of collections, intended for
// personal backup rather than sharing one workspace. Same shape as
// the single-collection format with a `collections: []` instead of a
// single `collection: {}`. Drop-import handles both formats.
export const PIN_LIBRARY_TRANSFER_FORMAT = 'paperazzi.library';
export const PIN_LIBRARY_TRANSFER_VERSION = 1;
export const PIN_LIBRARY_TRANSFER_MIME =
  'application/vnd.paperazzi.library+json';
export const PIN_LIBRARY_TRANSFER_SUFFIX = '.paperazzi-library.json';

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

export interface PinLibraryTransferFile {
  format: typeof PIN_LIBRARY_TRANSFER_FORMAT;
  version: typeof PIN_LIBRARY_TRANSFER_VERSION;
  app: 'paperazzi';
  exportedAt: string;
  collections: Array<{
    name: string;
    papers: Paper[];
    groups: PinGroup[];
  }>;
}

export interface ImportedPinCollection {
  name: string;
  papers: Paper[];
  groups: PinGroup[];
}

type ImportParseResult =
  | { ok: true; data: ImportedPinCollection }
  | { ok: false; error: string };

/**
 * Discriminated result for the unified import entrypoint — the
 * dropzone hands a file in without knowing whether the user dropped
 * a single-collection share file or a full-library backup. The
 * `kind` field lets the caller route to the right context method
 * without re-parsing.
 */
export type ImportTransferResult =
  | { ok: true; kind: 'collection'; data: ImportedPinCollection }
  | { ok: true; kind: 'library'; data: ImportedPinCollection[] }
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

  // User-authored fields — clamp to the same caps the UI enforces so a
  // hostile or stale export can't bypass them. An imported empty
  // string / empty array becomes `undefined` so we don't carry the
  // "the user added a note then erased it" footprint forward.
  const rawComment =
    typeof candidate.comment === 'string'
      ? candidate.comment.slice(0, MAX_PAPER_COMMENT_LENGTH).trim()
      : '';
  const comment = rawComment ? rawComment : undefined;

  const rawKeywords = Array.isArray(candidate.keywords)
    ? candidate.keywords
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim().slice(0, MAX_PAPER_KEYWORD_LENGTH))
        .filter(Boolean)
        .slice(0, MAX_PAPER_KEYWORDS)
    : [];
  // Dedupe case-insensitively, keep original casing of the first hit.
  const seen = new Set<string>();
  const keywordsList: string[] = [];
  for (const k of rawKeywords) {
    const key = k.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywordsList.push(k);
  }
  const keywords = keywordsList.length > 0 ? keywordsList : undefined;

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
    comment,
    keywords,
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

export function buildLibraryTransfer(
  collections: Array<{ name: string; papers: Paper[]; groups: PinGroup[] }>,
): PinLibraryTransferFile {
  return {
    format: PIN_LIBRARY_TRANSFER_FORMAT,
    version: PIN_LIBRARY_TRANSFER_VERSION,
    app: 'paperazzi',
    exportedAt: new Date().toISOString(),
    collections: collections.map(({ name, papers, groups }) => ({
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
    })),
  };
}

export function serializeLibraryTransfer(
  payload: PinLibraryTransferFile,
): string {
  return JSON.stringify(payload, null, 2);
}

export function buildLibraryTransferFilename(): string {
  // Stamp the filename with the date so successive backups don't
  // clobber each other in the user's downloads folder.
  const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `paperazzi-library-${stamp}${PIN_LIBRARY_TRANSFER_SUFFIX}`;
}

/**
 * Validate one raw collection record (the contents of `collection`
 * in a single-collection file, or each entry in a library file's
 * `collections` array). Centralised so single + library parsers
 * agree on what constitutes a valid collection.
 */
function normalizeCollectionRecord(
  rawCollection: unknown,
): ImportParseResult {
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
      error: `One collection has ${uniquePapers.length} pinned papers, but Paperazzi collections can hold at most ${MAX_PINS}.`,
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

  return normalizeCollectionRecord(payload.collection);
}

/**
 * Parse a library-format export — the multi-collection backup file
 * produced by `Export → All collections`. Validates each collection
 * record using the same rules as the single-collection parser; if any
 * one record is invalid the whole library import fails so the user
 * gets a clean all-or-nothing outcome.
 */
export function parseLibraryTransferText(raw: string): ImportTransferResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: 'That file does not look like a Paperazzi library export.',
    };
  }

  const payload = parsed as Record<string, unknown>;
  if (payload.format !== PIN_LIBRARY_TRANSFER_FORMAT) {
    return {
      ok: false,
      error: 'That file is not a Paperazzi library export.',
    };
  }
  if (payload.version !== PIN_LIBRARY_TRANSFER_VERSION) {
    return {
      ok: false,
      error: 'This Paperazzi library file uses an unsupported version.',
    };
  }

  const rawCollections = Array.isArray(payload.collections)
    ? payload.collections
    : null;
  if (!rawCollections || rawCollections.length === 0) {
    return {
      ok: false,
      error: 'That library export does not contain any collections.',
    };
  }

  const imported: ImportedPinCollection[] = [];
  for (const rawCollection of rawCollections) {
    const result = normalizeCollectionRecord(rawCollection);
    if (!result.ok) return { ok: false, error: result.error };
    imported.push(result.data);
  }

  return { ok: true, kind: 'library', data: imported };
}

/**
 * Unified entrypoint used by the global drag-and-drop dropzone. Peeks
 * at `format` to dispatch to the right parser so the dropzone doesn't
 * need to care which file the user dropped.
 */
export function parseImportTransferText(raw: string): ImportTransferResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return {
      ok: false,
      error: 'That file does not look like a Paperazzi export.',
    };
  }
  const payload = parsed as Record<string, unknown>;
  if (payload.format === PIN_LIBRARY_TRANSFER_FORMAT) {
    return parseLibraryTransferText(raw);
  }
  if (payload.format === PIN_COLLECTION_TRANSFER_FORMAT) {
    const result = parseCollectionTransferText(raw);
    if (!result.ok) return result;
    return { ok: true, kind: 'collection', data: result.data };
  }
  return {
    ok: false,
    error: 'That file is not a Paperazzi export.',
  };
}

export async function readCollectionImportFile(
  file: File,
): Promise<ImportParseResult> {
  const raw = await file.text();
  return parseCollectionTransferText(raw);
}

/** Read & parse a dropped file, accepting either format. */
export async function readImportFile(
  file: File,
): Promise<ImportTransferResult> {
  const raw = await file.text();
  return parseImportTransferText(raw);
}
