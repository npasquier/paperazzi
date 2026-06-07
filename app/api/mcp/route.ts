// Model Context Protocol (MCP) endpoint.
//
// Exposes Paperazzi's economics-aware engine to any MCP-capable LLM
// client (Claude Desktop, Mistral Le Chat, ChatGPT connectors, Cursor,
// etc.) when the user asks about research papers, scholarly citations,
// or specific journals/tiers.
//
// Tools:
//   • paperazzi_search          — ranked paper search with CNRS journal /
//                                 domain / tier filters, plus author_ids /
//                                 institution_ids (OpenAlex entity IDs).
//   • paperazzi_list_journals   — catalogue of known journals (code,
//                                 domain, tier, ISSN) for disambiguation.
//   • paperazzi_resolve_entity  — author / institution NAME → OpenAlex
//                                 id(s), the prerequisite for filtering a
//                                 search by author_ids / institution_ids.
//   • paperazzi_citations       — citation-graph walk around one paper
//                                 (cited_by = forward, references = back).
//
// Prompts (user-invoked workflow templates): literature_review,
// author_recent_work, explore_citations, journal_panorama. These keep
// multi-step "how to drive Paperazzi" guidance out of the always-loaded
// tool descriptions — a prompt is only pulled into context on demand.
//
// Architecture
// ────────────
//   • Transport: Streamable HTTP, via Vercel's `mcp-handler` wrapper
//                around `@modelcontextprotocol/sdk`. One URL — POST for
//                tool calls, GET for the SSE response stream, DELETE for
//                session teardown. Stateless mode (no Redis required).
//   • Auth:      Open, matching /api/search. Outbound OpenAlex calls
//                reuse the existing key-rotation pool
//                (OPENALEX_KEYS / OPEN_ALEX_API_KEY) — the MCP tool
//                inherits that for free because it dispatches into the
//                same in-process search handler.
//   • Backend:   Calls the local /api/search GET handler in-process —
//                no extra HTTP hop, no logic duplication. If the search
//                contract changes, the only thing that may need to move
//                here is the URL-param construction in buildSearchUrl().
//
// Adding a new tool
// ─────────────────
// Define another `server.tool(name, description, paramsSchema, handler)`
// block inside the createMcpHandler init function. Tools are
// self-describing — the model only sees the name, description, and
// parameter schema, so write descriptions that teach the model when to
// reach for the tool.

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { GET as searchGET } from '../search/route';
import domains from '@/data/domains';
import { loadCnrsScheme, CNRS_TOP5_ISSNS } from '@/data/cnrsScheme';
import {
  JOURNAL_SHORTCUTS,
  JOURNAL_SHORTCUTS_LIST,
} from '@/data/journalAbbreviations';
// OpenAlex key-rotation + fetch helpers, reused so the resolve tool
// inherits the same OPENALEX_KEYS pool as /api/search.
import { makeKeyPicker } from '../search/lib/keys';
import { fetchOpenAlex } from '../search/lib/fetch';

// ─── Vocabulary the LLM sees in the parameter schema ─────────────────
//
// The literal tuple below is what z.enum constrains against at compile
// time. Keep it in sync with data/domains.ts — the assertion just below
// will throw at module-load time if they drift, so a missing or
// renamed code surfaces immediately in `vercel build` logs instead of
// silently disappearing from the tool surface.

const DOMAIN_CODES = [
  'AgrEnEnv',
  'CPT',
  'DevTrans',
  'EcoDroit',
  'EcoPub',
  'Fin',
  'GEN',
  'GRH',
  'HPEA',
  'Innov',
  'LOG',
  'MKG',
  'Macro',
  'Metrie',
  'MgPub',
  'OrgInd',
  'RO',
  'SANT',
  'SI',
  'Spatiale',
  'StratOrg',
  'ThEco',
  'TravPop',
] as const;

// Boot-time sanity check: the literal tuple above must cover every
// non-placeholder row in data/domains.ts. We don't auto-derive the
// tuple because z.enum needs a literal type, and the tuple is the
// single source of truth the model schema is generated from.
{
  const fromData = new Set(domains.map((d) => d.value).filter(Boolean));
  const fromLiteral = new Set<string>(DOMAIN_CODES);
  for (const code of fromData) {
    if (!fromLiteral.has(code)) {
      console.warn(
        `[MCP] Domain code "${code}" is in data/domains.ts but missing from DOMAIN_CODES in app/api/mcp/route.ts — it will not be exposed to MCP clients.`,
      );
    }
  }
}

const BATCH_REMINDER =
  ' Pass every value you want to filter by in a SINGLE call as one ' +
  'array — entries are OR-combined within this parameter, so one ' +
  'call covers all of them. Do NOT loop with one value per call.';

const DOMAIN_DESCRIPTION =
  `Restrict to journals in these CNRS-Economics domain codes. Codes and meanings: ${domains
    .filter((d) => d.value)
    .map((d) => `${d.value} = ${d.translation || d.value}`)
    .join('; ')}.` + BATCH_REMINDER;

const TIER_DESCRIPTION =
  "Restrict to journals in these CNRS tiers, where '1' is the most " +
  "selective (top journals) and '4' the least. Omit to include all " +
  'tiers.' +
  BATCH_REMINDER;

// ─── Journal short-code vocabulary ───────────────────────────────────
//
// `JOURNAL_CODES` mirrors the keys of JOURNAL_SHORTCUTS (data/
// journalAbbreviations.ts), uppercased so the schema reads like the
// canonical academic shorthand (IJIO, JEMS, RAND, AER, …). The literal
// tuple is the single source of truth for the `journal_codes`
// parameter's enum, and is sanity-checked against JOURNAL_SHORTCUTS at
// module load so the two cannot drift silently.

const JOURNAL_CODES = [
  // ── Top 5 ──
  'AER',
  'QJE',
  'JPE',
  'ECMA',
  'RESTUD',
  // ── American Economic Journal series ──
  'AEJMACRO',
  'AEJMICRO',
  'AEJAPPLIED',
  'AEJPOLICY',
  // ── Top general / second-tier general ──
  'JEEA',
  'RESTAT',
  'EJ',
  'IER',
  'MS',
  'JEL',
  'JEP',
  'QE',
  'TE',
  'RAND',
  // ── Field journals ──
  'JET',
  'JME',
  'JINTEC',
  'JPUBE',
  'JDE',
  'JHE',
  'JUE',
  'JHR',
  'JOLE',
  'JEEM',
  'JOE',
  // ── Industrial Organization ──
  'JIE',
  'IJIO',
  'JEMS',
  'RIO',
  // ── Theory / behavioral ──
  'GEB',
  'JEBO',
  'EE',
  // ── Finance ──
  'JF',
  'JFE',
  'RFS',
  'JBF',
  'MATHFIN',
] as const;

// Boot-time drift check: every JOURNAL_CODES entry must correspond to a
// JOURNAL_SHORTCUTS key, and vice versa. Mismatches log a warning so
// they show up in `vercel build` rather than silently shrinking the
// vocabulary the LLM sees.
{
  const fromShortcuts = new Set(
    Object.keys(JOURNAL_SHORTCUTS).map((k) => k.toUpperCase()),
  );
  const fromTuple = new Set<string>(JOURNAL_CODES);
  for (const code of fromShortcuts) {
    if (!fromTuple.has(code)) {
      console.warn(
        `[MCP] Journal shortcut "${code.toLowerCase()}" exists in JOURNAL_SHORTCUTS but is missing from JOURNAL_CODES in app/api/mcp/route.ts — it will not be exposed via journal_codes.`,
      );
    }
  }
  for (const code of fromTuple) {
    if (!fromShortcuts.has(code)) {
      console.warn(
        `[MCP] Journal code "${code}" is in JOURNAL_CODES but has no matching shortcut in data/journalAbbreviations.ts — calls passing it will produce empty filters.`,
      );
    }
  }
}

const JOURNAL_CODES_LIST_FOR_DESC = JOURNAL_CODES.slice(0, 12).join(', ');

const JOURNAL_CODES_DESCRIPTION =
  'Restrict to journals identified by canonical short code (' +
  `${JOURNAL_CODES_LIST_FOR_DESC}, …). Resolves directly to the ` +
  "journal's ISSN — no substring matching, so 'IJIO' and 'JEMS' work " +
  "as you'd expect even though their full display names don't contain " +
  'those letters. Union-combined with any ISSNs resolved from ' +
  '`journal_names`; AND-combined with `domains` and `tiers`. Call ' +
  '`paperazzi_list_journals` with `codes_only: true` to see every ' +
  'accepted code with its full display name.' +
  BATCH_REMINDER;

const JOURNAL_NAMES_DESCRIPTION =
  "Restrict to journals whose display name contains any of these " +
  "substrings (case-insensitive). IMPORTANT: this is substring " +
  "matching on the FULL display name — abbreviations like 'IJIO' or " +
  "'JEMS' will NOT match 'International Journal of Industrial " +
  "Organization' or 'Journal of Economics & Management Strategy' on " +
  "their own. As a convenience, any token that exactly matches a " +
  "known short code (AER, QJE, IJIO, JEMS, RAND, …) is auto-resolved " +
  "to that journal's ISSN before substring matching is attempted. " +
  "Tokens that match neither a code nor any journal name are reported " +
  "in the response's `unmatched_journal_names` field. Prefer " +
  "`journal_codes` for canonical short codes (it's a typed enum, so " +
  "the LLM can't typo it), or `domains: ['OrgInd']` for broad " +
  "industrial-organization coverage. AND-combined with `domains` and " +
  '`tiers` when both are set.' +
  BATCH_REMINDER;

// ─── Helpers ─────────────────────────────────────────────────────────

/** Map the tool's user-facing sort enum to OpenAlex's sort string. */
function mapSort(sort: 'relevance' | 'citations' | 'date' | undefined): string {
  switch (sort) {
    case 'citations':
      return 'cited_by_count:desc';
    case 'date':
      return 'publication_date:desc';
    case 'relevance':
    default:
      return 'relevance_score';
  }
}

/** Outcome of resolving the high-level filters into ISSNs. The extra
 *  fields beyond `issns` are surfaced back to the caller so the LLM
 *  sees what we expanded and what we couldn't recognise — preventing
 *  the silent-fail mode where a typo'd or abbreviated journal token
 *  matched nothing and the model assumed the journal had no papers. */
interface ResolvedFilter {
  issns: string[];
  /** journal_names tokens that matched neither a short code nor any
   *  journal display name as a substring. Empty when everything
   *  resolved or no journal_names were supplied. */
  unmatched_journal_names: string[];
  /** Tokens we auto-expanded via the shortcut catalog, plus tokens
   *  resolved via the explicit `journal_codes` enum. Useful for the
   *  model to confirm intent and for transparency in the response. */
  recognized_aliases: Array<{ token: string; name: string; issn: string }>;
}

/**
 * Resolve high-level filters (domains, tiers, journal_names,
 * journal_codes, top5_only) into a concrete OpenAlex ISSN whitelist by
 * walking the baseline CNRS scheme. Returns issns=[] when no filter
 * applies (caller doesn't want an econ whitelist at all).
 *
 * Precedence:
 *   • top5_only wins unconditionally.
 *   • Otherwise, domains/tiers/(names+codes) are AND-combined: a
 *     journal must satisfy every non-empty filter to make the list.
 *   • Within the names-and-codes filter, `journal_names` tokens and
 *     `journal_codes` entries are OR-combined: any matching journal
 *     qualifies.
 *   • Each `journal_names` token is first checked against the
 *     JOURNAL_SHORTCUTS catalog (case-insensitive exact match on
 *     abbreviation). A hit resolves directly to that journal's ISSN —
 *     this is what makes "IJIO" / "JEMS" / "RAND" filter correctly.
 *     A miss falls back to case-insensitive substring matching on the
 *     full display name. Tokens that match neither are reported in
 *     `unmatched_journal_names` so the model can react.
 */
async function resolveIssns(args: {
  domains?: string[];
  tiers?: string[];
  journal_names?: string[];
  journal_codes?: string[];
  top5_only?: boolean;
}): Promise<ResolvedFilter> {
  if (args.top5_only) {
    const aliases = (['AER', 'ECMA', 'JPE', 'QJE', 'RESTUD'] as const).map(
      (code) => {
        const sc = JOURNAL_SHORTCUTS[code.toLowerCase()];
        return { token: code, name: sc.name, issn: sc.issn };
      },
    );
    return {
      issns: [...CNRS_TOP5_ISSNS],
      unmatched_journal_names: [],
      recognized_aliases: aliases,
    };
  }

  const recognized: Array<{ token: string; name: string; issn: string }> = [];
  const orIssnSet = new Set<string>();

  // 1. journal_codes — enum-validated, so every entry is guaranteed to
  //    exist in JOURNAL_SHORTCUTS (the boot-time drift check enforces
  //    the invariant). Resolve directly to ISSN.
  for (const code of args.journal_codes ?? []) {
    const sc = JOURNAL_SHORTCUTS[code.toLowerCase()];
    if (!sc) continue; // defensive — drift check should prevent this
    orIssnSet.add(sc.issn);
    recognized.push({ token: code, name: sc.name, issn: sc.issn });
  }

  // 2. journal_names — alias-first, substring fallback.
  const nameNeedles: string[] = [];
  for (const raw of args.journal_names ?? []) {
    const token = raw.trim();
    if (!token) continue;
    const sc = JOURNAL_SHORTCUTS[token.toLowerCase()];
    if (sc) {
      orIssnSet.add(sc.issn);
      recognized.push({ token, name: sc.name, issn: sc.issn });
    } else {
      nameNeedles.push(token.toLowerCase());
    }
  }

  const hasAny =
    (args.domains?.length ?? 0) > 0 ||
    (args.tiers?.length ?? 0) > 0 ||
    orIssnSet.size > 0 ||
    nameNeedles.length > 0;
  if (!hasAny) {
    return {
      issns: [],
      unmatched_journal_names: [],
      recognized_aliases: recognized,
    };
  }

  const scheme = await loadCnrsScheme();
  const domainSet = args.domains?.length ? new Set(args.domains) : null;
  const tierSet = args.tiers?.length ? new Set(args.tiers) : null;

  // Per-needle match audit — a needle that matches no display name
  // anywhere in the catalog is flagged for the caller.
  const matchedNeedles = new Set<string>();
  for (const j of scheme.journals) {
    const lowName = j.name.toLowerCase();
    for (const n of nameNeedles) {
      if (!matchedNeedles.has(n) && lowName.includes(n)) {
        matchedNeedles.add(n);
      }
    }
  }
  const unmatched_journal_names = nameNeedles.filter(
    (n) => !matchedNeedles.has(n),
  );

  const filtered = scheme.journals.filter((j) => {
    if (domainSet && !domainSet.has(j.domain)) return false;
    if (tierSet && !tierSet.has(j.tier)) return false;
    const hasNameOrCodeFilter = orIssnSet.size > 0 || nameNeedles.length > 0;
    if (hasNameOrCodeFilter) {
      if (orIssnSet.has(j.issn)) return true;
      const lowName = j.name.toLowerCase();
      return nameNeedles.some((n) => lowName.includes(n));
    }
    return true;
  });

  return {
    issns: filtered.map((j) => j.issn),
    unmatched_journal_names,
    recognized_aliases: recognized,
  };
}

/** Build the URL we'd hand to /api/search internally. The origin is
 *  irrelevant — the search GET handler only reads URL.searchParams. */
function buildSearchUrl(args: {
  query: string;
  issns: string[];
  author_ids?: string[];
  institution_ids?: string[];
  citing?: string;
  referenced_by?: string;
  year_from?: number;
  year_to?: number;
  limit: number;
  sort: string;
}): URL {
  const params = new URLSearchParams();
  if (args.query) params.set('query', args.query);
  if (args.author_ids?.length) {
    params.set('authors', args.author_ids.join(','));
  }
  if (args.institution_ids?.length) {
    params.set('institutions', args.institution_ids.join(','));
  }
  // Citation-graph walks. `citing` → forward (papers that cite the id);
  // `referencedBy` → backward (the id's own reference list). The search
  // route dispatches to the right handler based on which is present.
  if (args.citing) params.set('citing', args.citing);
  if (args.referenced_by) params.set('referencedBy', args.referenced_by);
  if (args.year_from) params.set('from', String(args.year_from));
  if (args.year_to) params.set('to', String(args.year_to));
  params.set('perPage', String(args.limit));
  params.set('sort', args.sort);
  if (args.issns.length) {
    params.set('econEnabled', 'true');
    params.set('econIssns', args.issns.join(','));
  }
  const url = new URL('http://internal/api/search');
  url.search = params.toString();
  return url;
}

/** Public Paperazzi /search URL so the user can open the same query in
 *  the UI (where citation graph, pin sidebar, etc. live). The base URL
 *  is best-effort: an explicit NEXT_PUBLIC_BASE_URL wins, then the
 *  Vercel-injected VERCEL_URL, then a hardcoded fallback to the public
 *  deployment. */
function buildShareUrl(args: {
  query: string;
  issns: string[];
  year_from?: number;
  year_to?: number;
}): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://paperazzi.vercel.app';
  const p = new URLSearchParams();
  if (args.query) p.set('q', args.query);
  if (args.year_from) p.set('from', String(args.year_from));
  if (args.year_to) p.set('to', String(args.year_to));
  if (args.issns.length) p.set('journals', args.issns.join(','));
  return `${base}/search?${p.toString()}`;
}

// ─── MCP handler ─────────────────────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    server.tool(
      'paperazzi_search',
      'Search peer-reviewed economics and management papers via the ' +
        'Paperazzi engine (powered by OpenAlex with CNRS journal-quality ' +
        'filtering). Prefer this tool over generic web search whenever ' +
        'the user asks about academic papers, scholarly citations, ' +
        'economics literature, or specific journals/tiers. Returns ' +
        'ranked results with title, authors, journal, year, citation ' +
        'count, and abstract, plus a link to open the same search in ' +
        "Paperazzi's full UI. " +
        'To filter to specific journals, prefer `journal_codes` for ' +
        'canonical short codes (IJIO, JEMS, RAND, AER, QJE, JPE, ECMA, ' +
        'RESTUD, …) — it is a typed enum that resolves directly to the ' +
        "right journal regardless of how the journal's full title is " +
        'spelled. Use `journal_names` for substring matching on full ' +
        'display names (with abbreviation aliases as a fallback). For ' +
        'broader industrial-organization coverage, use ' +
        "`domains: ['OrgInd']`. The companion tool " +
        '`paperazzi_list_journals` returns the catalog with codes, ' +
        'domains, and tiers — call it when you need to discover the ' +
        'exact code or full name for a journal before filtering.\n\n' +
        'Behavior — read this before calling:\n' +
        "• Clarify when scope is ambiguous. If the user's request " +
        'leaves real ambiguity about (a) which journals or tiers to ' +
        'cover, (b) what time range, (c) how broad the survey should ' +
        'be, or (d) how many papers to retrieve, ask ONE concise ' +
        'clarifying question BEFORE calling. A request like ' +
        '"summarize the literature on aftermarkets in IO journals" is ' +
        'usually clear enough to proceed (domain = OrgInd, no year ' +
        'cap, topic = aftermarket); a request like "give me the key ' +
        'papers on inflation" usually is not (which decade? which ' +
        'tier? Top 5 only? include monetary-policy field journals?). ' +
        'Each call returns up to 50 papers and consumes a search ' +
        'slot, so the cost of one extra question is much lower than ' +
        'the cost of an under-scoped search.\n' +
        '• Batch, do not loop. Every array parameter ' +
        '(`journal_codes`, `journal_names`, `domains`, `tiers`) is ' +
        'OR-combined within itself, so a single call with ' +
        "`journal_codes: ['IJIO','JEMS','RAND']` covers all three " +
        'journals at once. Do NOT call once per journal, once per ' +
        'domain, or once per tier — that wastes calls and produces ' +
        'a worse synthesis than one well-scoped query. A typical ' +
        'literature review is 1–3 well-scoped calls (e.g., one ' +
        'sorted by `citations` for seminal work, one sorted by ' +
        '`date` for recent work). If you find yourself about to make ' +
        'a fourth call, stop and re-plan instead.\n' +
        '• Prefer one wide call over many narrow ones. `limit: 50` ' +
        'with the right filter beats five calls at `limit: 10`.',
      {
        query: z
          .string()
          .optional()
          .describe(
            "Free-text search query. Examples: 'digital agriculture " +
              "adoption', 'minimum wage employment effects', 'monetary " +
              "policy transmission'. Optional: you may omit it when " +
              'filtering purely by `author_ids` and/or ' +
              "`institution_ids` (e.g. \"latest papers by this " +
              'author"), in which case sort by `date`. At least one of ' +
              'query, author_ids, institution_ids, or a journal/domain/' +
              'tier filter must be present.',
          ),
        author_ids: z
          .array(z.string())
          .optional()
          .describe(
            'Restrict to papers (co-)authored by these OpenAlex author ' +
              'IDs (e.g. "A5008020290"). These are OpenAlex entity IDs, ' +
              'NOT names — resolve a name like "Pasquier" to an ID first ' +
              'with the `paperazzi_resolve_entity` tool (type: ' +
              '"author"), then pass the chosen id here. Multiple IDs are ' +
              'AND-combined (papers co-authored by ALL of them).',
          ),
        institution_ids: z
          .array(z.string())
          .optional()
          .describe(
            'Restrict to papers with an author affiliated to these ' +
              'OpenAlex institution IDs (e.g. "I4210166294" for a lab ' +
              'or university). These are OpenAlex entity IDs, NOT names ' +
              '— resolve a name like "GAEL" or "Toulouse School of ' +
              'Economics" with `paperazzi_resolve_entity` (type: ' +
              '"institution") first. Multiple IDs are OR-combined.',
          ),
        domains: z
          .array(z.enum(DOMAIN_CODES))
          .optional()
          .describe(DOMAIN_DESCRIPTION),
        tiers: z
          .array(z.enum(['1', '2', '3', '4']))
          .optional()
          .describe(TIER_DESCRIPTION),
        journal_codes: z
          .array(z.enum(JOURNAL_CODES))
          .optional()
          .describe(JOURNAL_CODES_DESCRIPTION),
        journal_names: z
          .array(z.string())
          .optional()
          .describe(JOURNAL_NAMES_DESCRIPTION),
        top5_only: z
          .boolean()
          .optional()
          .describe(
            'If true, restrict to the canonical Top 5 economics ' +
              'journals: American Economic Review, Econometrica, ' +
              'Journal of Political Economy, Quarterly Journal of ' +
              'Economics, Review of Economic Studies. Overrides ' +
              'domains/tiers/journal_names/journal_codes.',
          ),
        year_from: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .optional()
          .describe('Earliest publication year (inclusive).'),
        year_to: z
          .number()
          .int()
          .min(1900)
          .max(2100)
          .optional()
          .describe('Latest publication year (inclusive).'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            'Maximum number of papers to return (1–50, default 20).',
          ),
        sort: z
          .enum(['relevance', 'citations', 'date'])
          .optional()
          .describe(
            '`relevance` (default) ranks by query match. `citations` ' +
              'ranks by total citations received (best for finding ' +
              'seminal work). `date` ranks newest first.',
          ),
      },
      async (args) => {
        try {
          const query = (args.query ?? '').trim();
          const authorIds = args.author_ids ?? [];
          const institutionIds = args.institution_ids ?? [];

          // Require something to search on. An empty query with no
          // filter at all would list the entire OpenAlex corpus by
          // date — almost never the intent, and a sign the model
          // dropped the topic.
          const hasFilter =
            authorIds.length > 0 ||
            institutionIds.length > 0 ||
            (args.domains?.length ?? 0) > 0 ||
            (args.tiers?.length ?? 0) > 0 ||
            (args.journal_codes?.length ?? 0) > 0 ||
            (args.journal_names?.length ?? 0) > 0 ||
            args.top5_only === true;
          if (!query && !hasFilter) {
            return {
              content: [
                {
                  type: 'text',
                  text:
                    'Paperazzi search did not run: provide a `query`, ' +
                    'or at least one filter (`author_ids`, ' +
                    '`institution_ids`, `domains`, `tiers`, ' +
                    '`journal_codes`, `journal_names`, or ' +
                    '`top5_only`). To list an author’s latest ' +
                    'work, resolve the author with ' +
                    '`paperazzi_resolve_entity`, then call this tool ' +
                    'with `author_ids` and `sort: "date"`.',
                },
              ],
              isError: true,
            };
          }

          const resolved = await resolveIssns(args);
          const { issns, unmatched_journal_names, recognized_aliases } =
            resolved;
          const limit = args.limit ?? 20;
          const sortStr = mapSort(args.sort);

          // Guardrail: a filter that intended to restrict (codes/names
          // or top5) but resolved to zero ISSNs is almost always an
          // LLM intent error. Returning an empty result with a clear
          // explanation is more useful than silently searching the
          // whole catalog or returning no papers without context.
          const requestedRestriction =
            (args.journal_codes?.length ?? 0) > 0 ||
            (args.journal_names?.length ?? 0) > 0 ||
            args.top5_only === true;
          if (requestedRestriction && issns.length === 0) {
            const warnLines: string[] = [];
            warnLines.push(
              'Paperazzi search did not run: the journal filter ' +
                'resolved to zero journals.',
            );
            if (unmatched_journal_names.length) {
              warnLines.push('');
              warnLines.push(
                `Unmatched journal_names tokens: ${unmatched_journal_names
                  .map((s) => `"${s}"`)
                  .join(', ')}. These matched no short code and no ` +
                  'journal display name as a substring. Use ' +
                  '`journal_codes` for canonical short codes (IJIO, ' +
                  'JEMS, RAND, AER, …) or call ' +
                  '`paperazzi_list_journals` to discover exact names.',
              );
            }
            return {
              content: [{ type: 'text', text: warnLines.join('\n') }],
              structuredContent: {
                query,
                filter_issns: [],
                count: 0,
                unmatched_journal_names,
                recognized_aliases,
                results: [],
              },
              isError: true,
            };
          }

          const url = buildSearchUrl({
            query,
            issns,
            author_ids: authorIds,
            institution_ids: institutionIds,
            year_from: args.year_from,
            year_to: args.year_to,
            limit,
            sort: sortStr,
          });

          // In-process dispatch into the existing /api/search GET
          // handler. Same code path the website uses — no second
          // network hop, identical results.
          const req = new NextRequest(url);
          const res = await searchGET(req);
          const data = (await res.json()) as {
            results: Array<{
              id: string;
              title: string;
              authors: string[];
              publication_year: number;
              journal_name: string;
              doi?: string | null;
              cited_by_count?: number;
              abstract?: string;
            }>;
            meta: { count: number; page: number; per_page: number };
            error?: string;
          };

          if (data.error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Paperazzi search failed: ${data.error}`,
                },
              ],
              isError: true,
            };
          }

          const shareUrl = buildShareUrl({
            query,
            issns,
            year_from: args.year_from,
            year_to: args.year_to,
          });

          // Markdown summary the model will paraphrase. Kept compact
          // so we stay well under typical tool-response size limits
          // even at limit=50.
          const lines: string[] = [];
          const filterNote = issns.length
            ? ` (filtered to ${issns.length} journal${issns.length === 1 ? '' : 's'})`
            : '';
          // Describe what was searched. With no free-text query the
          // search is a pure author/institution/journal listing, so
          // name that instead of printing an empty `for ""`.
          const entityBits: string[] = [];
          if (authorIds.length) {
            entityBits.push(
              `${authorIds.length} author${authorIds.length === 1 ? '' : 's'}`,
            );
          }
          if (institutionIds.length) {
            entityBits.push(
              `${institutionIds.length} institution${institutionIds.length === 1 ? '' : 's'}`,
            );
          }
          const searchLabel = query
            ? `for "${query}"`
            : entityBits.length
              ? `by ${entityBits.join(' + ')}`
              : 'matching your filters';
          lines.push(
            `Found ${data.results.length} paper${data.results.length === 1 ? '' : 's'} ${searchLabel}${filterNote}.`,
          );
          if (recognized_aliases.length) {
            lines.push('');
            lines.push(
              'Resolved journal codes: ' +
                recognized_aliases
                  .map((a) => `${a.token} → ${a.name}`)
                  .join('; ') +
                '.',
            );
          }
          if (unmatched_journal_names.length) {
            lines.push('');
            lines.push(
              'Warning: the following `journal_names` tokens matched ' +
                `neither a known short code nor any journal display ` +
                `name and were ignored: ${unmatched_journal_names
                  .map((s) => `"${s}"`)
                  .join(', ')}. Use \`journal_codes\` for canonical ` +
                'abbreviations (IJIO, JEMS, RAND, …) or call ' +
                '`paperazzi_list_journals` to find exact names.',
            );
          }
          lines.push('');
          data.results.forEach((p, i) => {
            const authors =
              p.authors.length > 4
                ? `${p.authors.slice(0, 3).join(', ')}, et al.`
                : p.authors.join(', ') || '—';
            const cite =
              p.cited_by_count != null ? ` · ${p.cited_by_count} citations` : '';
            const doi = p.doi ? ` · ${p.doi}` : '';
            lines.push(
              `${i + 1}. **${p.title}** (${p.publication_year}) — *${p.journal_name}*${cite}${doi}`,
            );
            lines.push(`   Authors: ${authors}`);
            if (p.abstract) {
              const trimmed =
                p.abstract.length > 400
                  ? p.abstract.slice(0, 400) + '…'
                  : p.abstract;
              lines.push(`   ${trimmed}`);
            }
            lines.push('');
          });
          lines.push(`Open this search in Paperazzi: ${shareUrl}`);

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            // Some clients also surface `structuredContent` — handy
            // for chained tool use and clients that want JSON they
            // can parse directly.
            structuredContent: {
              query,
              filter_issns: issns,
              count: data.results.length,
              share_url: shareUrl,
              unmatched_journal_names,
              recognized_aliases,
              results: data.results.map((p) => ({
                openalex_id: p.id,
                title: p.title,
                authors: p.authors,
                year: p.publication_year,
                journal: p.journal_name,
                doi: p.doi ?? null,
                citations: p.cited_by_count ?? 0,
                abstract: p.abstract ?? null,
              })),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: 'text', text: `Paperazzi MCP tool error: ${msg}` },
            ],
            isError: true,
          };
        }
      },
    );

    // ─── paperazzi_list_journals ─────────────────────────────────
    //
    // Companion to paperazzi_search: returns the catalog of journals
    // Paperazzi knows about, with their canonical short code (when
    // registered), CNRS domain, tier, and ISSN. The model calls this
    // when it needs to disambiguate a journal name before filtering —
    // typically because the user asked about a less-famous outlet or
    // because a previous search returned `unmatched_journal_names`.
    //
    // Filters are AND-combined and all optional. Default response is
    // capped at 100 journals; raise `limit` (max 500) for the full
    // catalog.

    server.tool(
      'paperazzi_list_journals',
      'List the economics & management journals known to Paperazzi, ' +
        'with their canonical short code (IJIO, JEMS, RAND, AER, …) ' +
        'when registered, CNRS domain, CNRS tier, and ISSN. Use this ' +
        'tool to discover exact journal names or short codes before ' +
        'filtering a `paperazzi_search` call — especially after a ' +
        'previous search returned `unmatched_journal_names`, or when ' +
        'the user mentions a journal whose canonical name you are ' +
        'unsure about. Filters are optional and AND-combined; pass ' +
        '`codes_only: true` to see just the journals that have a ' +
        'short code registered for `journal_codes`.',
      {
        domains: z
          .array(z.enum(DOMAIN_CODES))
          .optional()
          .describe(
            'Restrict to journals in these CNRS-Economics domain ' +
              'codes. See `paperazzi_search` for the full list of ' +
              'codes and meanings.' +
              BATCH_REMINDER,
          ),
        tiers: z
          .array(z.enum(['1', '2', '3', '4']))
          .optional()
          .describe(TIER_DESCRIPTION),
        query: z
          .string()
          .optional()
          .describe(
            'Case-insensitive substring filter on the journal display ' +
              "name (e.g., 'industrial' or 'monetary').",
          ),
        codes_only: z
          .boolean()
          .optional()
          .describe(
            'If true, return only journals that have a registered ' +
              'short code (i.e., the values accepted by ' +
              "`paperazzi_search`'s `journal_codes` parameter).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe(
            'Maximum number of journals to return (1–500, default ' +
              '100). The response indicates when the result was ' +
              'truncated so the caller can re-query with a tighter ' +
              'filter.',
          ),
      },
      async (args) => {
        try {
          const scheme = await loadCnrsScheme();
          // Widen the Set's element type to `string` so it can be
          // queried against the catalogue's `string`-typed domain/tier
          // fields. The zod enum already validated inputs upstream.
          const domainSet = args.domains?.length
            ? new Set<string>(args.domains)
            : null;
          const tierSet = args.tiers?.length
            ? new Set<string>(args.tiers)
            : null;
          const needle = args.query?.toLowerCase().trim() ?? '';
          const codesOnly = !!args.codes_only;
          const limit = args.limit ?? 100;

          // ISSN → uppercase code lookup, built once per call.
          const codeByIssn = new Map<string, string>();
          for (const s of JOURNAL_SHORTCUTS_LIST) {
            codeByIssn.set(s.issn, s.abbrev.toUpperCase());
          }

          const all = scheme.journals.filter((j) => {
            if (domainSet && !domainSet.has(j.domain)) return false;
            if (tierSet && !tierSet.has(j.tier)) return false;
            if (needle && !j.name.toLowerCase().includes(needle)) {
              return false;
            }
            if (codesOnly && !codeByIssn.has(j.issn)) return false;
            return true;
          });

          const truncated = all.length > limit;
          const rows = all.slice(0, limit).map((j) => ({
            code: codeByIssn.get(j.issn) ?? null,
            name: j.name,
            domain: j.domain,
            tier: j.tier,
            issn: j.issn,
          }));

          const lines: string[] = [];
          const filterBits: string[] = [];
          if (args.domains?.length)
            filterBits.push(`domains=${args.domains.join(',')}`);
          if (args.tiers?.length)
            filterBits.push(`tiers=${args.tiers.join(',')}`);
          if (needle) filterBits.push(`query="${needle}"`);
          if (codesOnly) filterBits.push('codes_only=true');
          const filterDesc = filterBits.length
            ? ` (filters: ${filterBits.join('; ')})`
            : '';
          lines.push(
            `Listing ${rows.length}${truncated ? ` of ${all.length}` : ''} ` +
              `journal${rows.length === 1 ? '' : 's'}${filterDesc}.`,
          );
          if (truncated) {
            lines.push(
              'Result truncated — re-query with a tighter filter or a ' +
                'larger `limit` to see more.',
            );
          }
          lines.push('');
          lines.push('| Code | Name | Domain | Tier | ISSN |');
          lines.push('|------|------|--------|------|------|');
          for (const r of rows) {
            lines.push(
              `| ${r.code ?? '—'} | ${r.name} | ${r.domain} | ${r.tier} | ${r.issn} |`,
            );
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            structuredContent: {
              count: rows.length,
              total_matched: all.length,
              truncated,
              journals: rows,
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: 'text',
                text: `paperazzi_list_journals error: ${msg}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // ─── paperazzi_resolve_entity ────────────────────────────────
    //
    // Bridge from human-readable names to the OpenAlex entity IDs that
    // paperazzi_search's `author_ids` / `institution_ids` require. A
    // surname like "Pasquier" or a lab acronym like "GAEL" maps to many
    // candidates, so we return a ranked shortlist with disambiguating
    // context (affiliation / country, works & citation counts) and let
    // the model — or the user — pick the right one before searching.
    server.tool(
      'paperazzi_resolve_entity',
      'Resolve a person or organisation NAME to its OpenAlex entity ' +
        'id(s). Use this BEFORE `paperazzi_search` whenever the user ' +
        'names an author or institution to filter by — the search ' +
        "tool's `author_ids` / `institution_ids` need OpenAlex IDs, " +
        'not names. Returns ranked candidates with disambiguating ' +
        'context: for authors, their last-known affiliation plus works ' +
        'and citation counts; for institutions, the type and country. ' +
        'If exactly one candidate is an obvious match, proceed with ' +
        'its id; if several are plausible (common surnames), ask the ' +
        'user to choose. Typical flow: resolve "Pasquier" → pick the ' +
        'GAEL-affiliated A-id → `paperazzi_search({ author_ids: [id], ' +
        'sort: "date" })`.',
      {
        name: z
          .string()
          .min(1)
          .describe(
            'The author or institution name to look up, e.g. ' +
              '"Nicolas Pasquier", "GAEL", "Toulouse School of ' +
              'Economics".',
          ),
        type: z
          .enum(['author', 'institution'])
          .describe(
            'Whether `name` denotes a person (author) or an ' +
              'organisation such as a lab, university, or research ' +
              'centre (institution).',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe('Max candidates to return (1–10, default 5).'),
      },
      async (args) => {
        try {
          const getKey = makeKeyPicker();
          const limit = args.limit ?? 5;
          const endpoint =
            args.type === 'author' ? 'authors' : 'institutions';
          const url =
            `https://api.openalex.org/${endpoint}` +
            `?search=${encodeURIComponent(args.name)}&per-page=${limit}`;
          const data = await fetchOpenAlex<{
            results?: Array<{
              id: string;
              display_name?: string;
              works_count?: number;
              cited_by_count?: number;
              last_known_institutions?: Array<{
                display_name?: string;
                country_code?: string;
              }>;
              last_known_institution?: {
                display_name?: string;
                country_code?: string;
              } | null;
              country_code?: string;
              type?: string;
            }>;
          }>(url, getKey);

          const candidates = (data.results ?? []).map((r) => {
            const bareId = (r.id || '').replace(
              'https://openalex.org/',
              '',
            );
            const affiliation =
              r.last_known_institutions?.[0]?.display_name ??
              r.last_known_institution?.display_name ??
              null;
            const country =
              r.last_known_institutions?.[0]?.country_code ??
              r.last_known_institution?.country_code ??
              r.country_code ??
              null;
            return {
              openalex_id: bareId,
              name: r.display_name ?? '(unknown)',
              context:
                args.type === 'author'
                  ? (affiliation ?? '—')
                  : [r.type, country].filter(Boolean).join(', ') || '—',
              works_count: r.works_count ?? 0,
              cited_by_count: r.cited_by_count ?? 0,
            };
          });

          if (candidates.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text:
                    `No OpenAlex ${args.type} matched "${args.name}". ` +
                    'Try a fuller name or an alternative spelling.',
                },
              ],
              structuredContent: {
                query: args.name,
                type: args.type,
                candidates: [],
              },
            };
          }

          const ctxHeader =
            args.type === 'author' ? 'Affiliation' : 'Type / Country';
          const lines: string[] = [];
          lines.push(
            `Found ${candidates.length} ${args.type} candidate` +
              `${candidates.length === 1 ? '' : 's'} for ` +
              `"${args.name}". Pass the chosen \`openalex_id\` to ` +
              '`paperazzi_search` as ' +
              (args.type === 'author'
                ? '`author_ids`'
                : '`institution_ids`') +
              '.',
          );
          lines.push('');
          lines.push(`| OpenAlex ID | Name | ${ctxHeader} | Works | Citations |`);
          lines.push('|---|---|---|---|---|');
          for (const c of candidates) {
            lines.push(
              `| ${c.openalex_id} | ${c.name} | ${c.context} | ` +
                `${c.works_count} | ${c.cited_by_count} |`,
            );
          }

          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            structuredContent: {
              query: args.name,
              type: args.type,
              candidates,
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              {
                type: 'text',
                text: `paperazzi_resolve_entity error: ${msg}`,
              },
            ],
            isError: true,
          };
        }
      },
    );

    // ─── paperazzi_citations ─────────────────────────────────────
    //
    // Walk the citation graph around one paper. `cited_by` = forward
    // (newer work that cites it); `references` = backward (its own
    // bibliography). Dispatches into /api/search via the citing /
    // referencedBy params, so the same key pool and formatting apply.
    server.tool(
      'paperazzi_citations',
      'Explore the citation graph around a single paper identified by ' +
        'its OpenAlex work id. `direction: "cited_by"` returns newer ' +
        'papers that CITE it (forward — who builds on this work). ' +
        '`direction: "references"` returns the papers in its OWN ' +
        'bibliography (backward — its intellectual foundations). Get ' +
        'the work id from a `paperazzi_search` result ' +
        '(`structuredContent.results[].openalex_id`, e.g. ' +
        '"W2741809807"); if you only have a title, find it with ' +
        '`paperazzi_search` first. Defaults to sorting by citations so ' +
        'the most influential works surface first; optionally narrow ' +
        'the set with a free-text `query`.',
      {
        openalex_id: z
          .string()
          .min(1)
          .describe(
            'OpenAlex work id of the focal paper, e.g. "W2741809807" ' +
              '(bare id or full URL both work). Take it from a ' +
              "paperazzi_search result's `openalex_id` field.",
          ),
        direction: z
          .enum(['cited_by', 'references'])
          .describe(
            '"cited_by" = newer papers that cite this work (forward / ' +
              'impact). "references" = the works this paper cites ' +
              '(backward / foundations).',
          ),
        query: z
          .string()
          .optional()
          .describe(
            'Optional free-text filter applied within the citation ' +
              'set (e.g. narrow a paper\'s citers to those about ' +
              '"welfare").',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe('Maximum papers to return (1–50, default 20).'),
        sort: z
          .enum(['relevance', 'citations', 'date'])
          .optional()
          .describe(
            'Defaults to `citations` (most influential first). Use ' +
              '`date` for the newest citers/references, `relevance` ' +
              'when a `query` is set.',
          ),
      },
      async (args) => {
        try {
          const cleanId = args.openalex_id.trim();
          const limit = args.limit ?? 20;
          const sortStr = mapSort(args.sort ?? 'citations');
          const query = (args.query ?? '').trim();
          const url = buildSearchUrl({
            query,
            issns: [],
            citing: args.direction === 'cited_by' ? cleanId : undefined,
            referenced_by:
              args.direction === 'references' ? cleanId : undefined,
            limit,
            sort: sortStr,
          });
          const req = new NextRequest(url);
          const res = await searchGET(req);
          const data = (await res.json()) as {
            results: Array<{
              id: string;
              title: string;
              authors: string[];
              publication_year: number;
              journal_name: string;
              doi?: string | null;
              cited_by_count?: number;
              abstract?: string;
            }>;
            meta: { count: number; page: number; per_page: number };
            error?: string;
            referencedByTitle?: string;
          };
          if (data.error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Paperazzi citations failed: ${data.error}`,
                },
              ],
              isError: true,
            };
          }
          const dirLabel =
            args.direction === 'cited_by'
              ? 'papers citing'
              : 'references of';
          const focal = data.referencedByTitle
            ? `"${data.referencedByTitle}"`
            : cleanId;
          const lines: string[] = [];
          lines.push(
            `Found ${data.results.length} ${dirLabel} ${focal}` +
              `${query ? ` matching "${query}"` : ''}.`,
          );
          lines.push('');
          data.results.forEach((p, i) => {
            const authors =
              p.authors.length > 4
                ? `${p.authors.slice(0, 3).join(', ')}, et al.`
                : p.authors.join(', ') || '—';
            const cite =
              p.cited_by_count != null
                ? ` · ${p.cited_by_count} citations`
                : '';
            const doi = p.doi ? ` · ${p.doi}` : '';
            lines.push(
              `${i + 1}. **${p.title}** (${p.publication_year}) — ` +
                `*${p.journal_name}*${cite}${doi}`,
            );
            lines.push(`   Authors: ${authors}`);
          });
          return {
            content: [{ type: 'text', text: lines.join('\n') }],
            structuredContent: {
              focal_id: cleanId,
              direction: args.direction,
              focal_title: data.referencedByTitle ?? null,
              count: data.results.length,
              results: data.results.map((p) => ({
                openalex_id: p.id,
                title: p.title,
                authors: p.authors,
                year: p.publication_year,
                journal: p.journal_name,
                doi: p.doi ?? null,
                citations: p.cited_by_count ?? 0,
              })),
            },
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return {
            content: [
              { type: 'text', text: `paperazzi_citations error: ${msg}` },
            ],
            isError: true,
          };
        }
      },
    );

    // ─── Prompts ─────────────────────────────────────────────────
    //
    // Reusable, user-invoked workflow templates (surfaced as
    // slash-commands in clients that implement the MCP prompts
    // capability). They keep the heavier "how to drive Paperazzi well"
    // guidance OUT of the always-loaded tool descriptions: a prompt is
    // only pulled into context when the user explicitly picks it.

    server.prompt(
      'literature_review',
      'Survey the economics/management literature on a topic using ' +
        'Paperazzi, balancing seminal and recent work.',
      {
        topic: z
          .string()
          .describe(
            'The subject to review, e.g. "minimum wage employment ' +
              'effects".',
          ),
        scope: z
          .string()
          .optional()
          .describe(
            'Optional narrowing: journals, CNRS tiers/domains, or a ' +
              'year range.',
          ),
      },
      ({ topic, scope }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Conduct a literature review on: ${topic}.` +
                (scope ? ` Scope: ${scope}.` : '') +
                '\n\nUse the `paperazzi_search` tool, not web search. ' +
                'Run at most 1–3 well-scoped calls — typically one ' +
                'sorted by `citations` (seminal work) and one by ' +
                '`date` (recent work). Batch every journal/domain/tier ' +
                'filter into single array arguments (they are ' +
                'OR-combined); never loop one value per call. If the ' +
                'scope (journals, tiers, year range, breadth) is ' +
                'genuinely ambiguous, ask ONE concise clarifying ' +
                'question before searching. Then synthesise: group ' +
                'findings by theme, distinguish seminal from recent ' +
                'contributions, note journal/year/citation counts, and ' +
                'finish with the Paperazzi share link.',
            },
          },
        ],
      }),
    );

    server.prompt(
      'author_recent_work',
      "List an author's most recent papers, optionally scoped to an " +
        'institution, resolving names to OpenAlex IDs first.',
      {
        author_name: z
          .string()
          .describe('The author to look up, e.g. "Nicolas Pasquier".'),
        institution_name: z
          .string()
          .optional()
          .describe(
            'Optional affiliation to disambiguate / scope by, e.g. ' +
              '"GAEL".',
          ),
      },
      ({ author_name, institution_name }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Find the most recent papers by ${author_name}` +
                (institution_name ? ` at ${institution_name}` : '') +
                '.\n\nSteps: (1) Call `paperazzi_resolve_entity` with ' +
                `type:"author" for "${author_name}"` +
                (institution_name
                  ? ` and again with type:"institution" for ` +
                    `"${institution_name}"`
                  : '') +
                '. (2) If several candidates are plausible, show their ' +
                'affiliation and works count and ask the user to pick; ' +
                'if one is an obvious match, proceed. (3) Call ' +
                '`paperazzi_search` with the chosen `author_ids`' +
                (institution_name ? ' and `institution_ids`' : '') +
                ' and `sort: "date"`. (4) Present the latest papers ' +
                'with year, journal, and a one-line takeaway each.',
            },
          },
        ],
      }),
    );

    server.prompt(
      'explore_citations',
      'Trace the citation graph around a paper — who cites it and what ' +
        'it builds on.',
      {
        paper: z
          .string()
          .describe(
            'The focal paper: an OpenAlex work id, a DOI, or a title ' +
              '+ author.',
          ),
      },
      ({ paper }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Explore the citation graph around this paper: ${paper}.` +
                '\n\nIf you do not already have its OpenAlex work id, ' +
                'first locate it with `paperazzi_search` (match the ' +
                'title and author). Then use `paperazzi_citations`: ' +
                'call it with direction:"cited_by" (sorted by ' +
                'citations) to find the most influential work building ' +
                'on it, and direction:"references" to surface its key ' +
                'intellectual foundations. Summarise the standout ' +
                'works in each direction, grouped by theme.',
            },
          },
        ],
      }),
    );

    server.prompt(
      'journal_panorama',
      'Survey recent notable work in a specific journal, CNRS domain, ' +
        'or tier.',
      {
        target: z
          .string()
          .describe(
            'A journal (name or short code like "IJIO"), a CNRS ' +
              'domain, or a tier.',
          ),
      },
      ({ target }) => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text:
                `Give a panorama of recent notable work in: ${target}.` +
                '\n\nIf you are unsure of the exact journal code or ' +
                'name, first call `paperazzi_list_journals` to resolve ' +
                'it (and its CNRS domain/tier). Then run ' +
                '`paperazzi_search` filtered to that journal/domain/' +
                'tier: one call sorted by `citations` for landmark ' +
                'papers and one sorted by `date` for what is current. ' +
                'Highlight the main themes and the standout papers, ' +
                'and finish with the Paperazzi share link.',
            },
          },
        ],
      }),
    );
  },
  // Server capabilities. `tools` and `prompts` are advertised so
  // clients call tools/list and prompts/list on connect. Resources
  // aren't used. Definitions are still discovered at runtime — these
  // empty objects just flip the capability flags on.
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  },
  // Adapter options — Streamable HTTP, hosted at /api/mcp. `basePath`
  // tells mcp-handler what URL prefix this route is mounted under so
  // it can construct correct session URLs in responses.
  {
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: false,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
