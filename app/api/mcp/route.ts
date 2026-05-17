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

const DOMAIN_DESCRIPTION = `Restrict to journals in these CNRS-Economics domain codes. Codes and meanings: ${domains
  .filter((d) => d.value)
  .map((d) => `${d.value} = ${d.translation || d.value}`)
  .join('; ')}.`;

const TIER_DESCRIPTION =
  "Restrict to journals in these CNRS tiers, where '1' is the most selective (top journals) and '4' the least. Omit to include all tiers.";

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

/**
 * Resolve high-level filters (domains, tiers, journal_names, top5_only)
 * into a concrete OpenAlex ISSN whitelist by walking the baseline CNRS
 * scheme. Returns [] when no filter applies (caller doesn't want an
 * econ whitelist at all).
 *
 * Precedence:
 *   • top5_only wins unconditionally.
 *   • Otherwise, domains/tiers/journal_names are AND-combined: a
 *     journal must satisfy every non-empty filter to make the list.
 *   • journal_names matches by case-insensitive substring on the
 *     journal's display name — generous on purpose so the model can
 *     pass "Econometrica" or "econometrica" or "Quarterly Journal of
 *     Economics" without exact-string anxiety.
 */
async function resolveIssns(args: {
  domains?: string[];
  tiers?: string[];
  journal_names?: string[];
  top5_only?: boolean;
}): Promise<string[]> {
  if (args.top5_only) return [...CNRS_TOP5_ISSNS];

  const hasAny =
    (args.domains?.length ?? 0) > 0 ||
    (args.tiers?.length ?? 0) > 0 ||
    (args.journal_names?.length ?? 0) > 0;
  if (!hasAny) return [];

  const scheme = await loadCnrsScheme();
  const domainSet = args.domains?.length ? new Set(args.domains) : null;
  const tierSet = args.tiers?.length ? new Set(args.tiers) : null;
  const nameNeedles = (args.journal_names || []).map((s) => s.toLowerCase());

  return scheme.journals
    .filter((j) => {
      if (domainSet && !domainSet.has(j.domain)) return false;
      if (tierSet && !tierSet.has(j.tier)) return false;
      if (
        nameNeedles.length &&
        !nameNeedles.some((n) => j.name.toLowerCase().includes(n))
      ) {
        return false;
      }
      return true;
    })
    .map((j) => j.issn);
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
        "Paperazzi's full UI.",
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
        journal_names: z
          .array(z.string())
          .optional()
          .describe(
            'Restrict to journals whose display name contains any of ' +
              'these strings (case-insensitive substring match). ' +
              'AND-combined with `domains`/`tiers` when both are set.',
          ),
        top5_only: z
          .boolean()
          .optional()
          .describe(
            'If true, restrict to the canonical Top 5 economics ' +
              'journals: American Economic Review, Econometrica, ' +
              'Journal of Political Economy, Quarterly Journal of ' +
              'Economics, Review of Economic Studies. Overrides ' +
              'domains/tiers/journal_names.',
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
          const issns = await resolveIssns(args);
          const mode = args.mode ?? 'keyword';
          const limit = args.limit ?? 20;
          const sortStr = mapSort(args.sort);

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
