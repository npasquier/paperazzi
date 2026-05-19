// Model Context Protocol (MCP) endpoint.
//
// Exposes Paperazzi's economics-aware search as a single tool,
// `paperazzi_search`, so any MCP-capable LLM client (Claude Desktop,
// Mistral Le Chat with custom connectors, ChatGPT with connectors,
// Cursor, etc.) can invoke Paperazzi when the user asks about research
// papers, scholarly citations, or specific journals/tiers.
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
  year_from?: number;
  year_to?: number;
  mode: 'keyword' | 'semantic';
  limit: number;
  sort: string;
}): URL {
  const params = new URLSearchParams();
  if (args.query) params.set('query', args.query);
  if (args.year_from) params.set('from', String(args.year_from));
  if (args.year_to) params.set('to', String(args.year_to));
  params.set('perPage', String(args.limit));
  params.set('sort', args.sort);
  if (args.mode === 'semantic') params.set('semantic', 'true');
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
  mode: 'keyword' | 'semantic';
}): string {
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'https://paperazzi.vercel.app';
  const p = new URLSearchParams();
  if (args.query) p.set('q', args.query);
  if (args.year_from) p.set('from', String(args.year_from));
  if (args.year_to) p.set('to', String(args.year_to));
  if (args.mode === 'semantic') p.set('semantic', 'true');
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
          .min(1)
          .describe(
            "Free-text search query. Examples: 'digital agriculture " +
              "adoption', 'minimum wage employment effects', 'monetary " +
              "policy transmission'.",
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
        mode: z
          .enum(['keyword', 'semantic'])
          .optional()
          .describe(
            '`keyword` (default) is OpenAlex standard ranked search. ' +
              '`semantic` uses concept-based retrieval — better for ' +
              'vague topic questions, but capped at 50 results and ' +
              'rate-limited to ~1 req/s upstream.',
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(
            'Maximum number of papers to return (1–50, default 20). ' +
              'Semantic mode is hard-capped at 50 by OpenAlex.',
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
          const resolved = await resolveIssns(args);
          const { issns, unmatched_journal_names, recognized_aliases } =
            resolved;
          const mode = args.mode ?? 'keyword';
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
                query: args.query,
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
            query: args.query,
            issns,
            year_from: args.year_from,
            year_to: args.year_to,
            mode,
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
            query: args.query,
            issns,
            year_from: args.year_from,
            year_to: args.year_to,
            mode,
          });

          // Markdown summary the model will paraphrase. Kept compact
          // so we stay well under typical tool-response size limits
          // even at limit=50.
          const lines: string[] = [];
          const filterNote = issns.length
            ? ` (filtered to ${issns.length} journal${issns.length === 1 ? '' : 's'})`
            : '';
          lines.push(
            `Found ${data.results.length} paper${data.results.length === 1 ? '' : 's'} for "${args.query}"${filterNote}.`,
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
              query: args.query,
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
  },
  // Server capabilities — empty is fine. Tool definitions registered
  // via `server.tool(...)` are discovered at runtime via tools/list,
  // which is how every current MCP client picks them up.
  {
    capabilities: {
      tools: {},
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
