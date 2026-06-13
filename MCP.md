# Paperazzi MCP server

Paperazzi exposes an [MCP](https://modelcontextprotocol.io/) endpoint at
`/api/mcp` so any MCP-capable LLM client can search peer-reviewed
economics papers through the same engine that powers the web app —
ranking-aware journal filtering, CNRS tier/domain whitelists, citation
graph walks, and more.

The endpoint is **open**: no token, no account. The deployed URL is:

    https://paperazzi.vercel.app/api/mcp

---

## Tools

### `paperazzi_search`

Ranked paper search with CNRS journal-quality filtering.

```text
paperazzi_search({
  query?:           string,                          // free-text, e.g. "digital agriculture adoption"
  author_ids?:      string[],                        // OpenAlex author IDs (AND-combined)
  institution_ids?: string[],                        // OpenAlex institution IDs (OR-combined)
  domains?:         ("OrgInd" | "Macro" | "Fin" | ...)[],  // CNRS domain codes
  tiers?:           ("1" | "2" | "3" | "4")[],       // CNRS tiers, 1 = most selective
  journal_codes?:   ("AER" | "QJE" | "IJIO" | ...)[],     // typed short codes → exact ISSN
  journal_names?:   string[],                        // substring match on full display names
  top5_only?:       boolean,                         // AER, ECMA, JPE, QJE, ReStud
  year_from?:       number,
  year_to?:         number,
  limit?:           number,                          // 1–50, default 20
  sort?:            "relevance" | "citations" | "date",
})
```

Returns `count`, `total_count`, title/authors/journal/year/citations/DOI/abstract,
and a `share_url` that opens the same search in the Paperazzi UI.
`total_count` tells you how many results exist in total — when it exceeds
`count`, raise `limit` or narrow your filters.

**Typical flow for author/institution searches:** resolve the name to an
OpenAlex ID with `paperazzi_resolve_entity` first, then pass `author_ids`
or `institution_ids` here with `sort: "date"`.

---

### `paperazzi_list_journals`

Catalogue of journals known to Paperazzi (CNRS domain, tier, ISSN, short
code). Use this to discover exact journal names or short codes before
filtering a search, especially after a previous search returns
`unmatched_journal_names`.

```text
paperazzi_list_journals({
  domains?:    string[],    // CNRS domain codes
  tiers?:      string[],    // "1"–"4"
  query?:      string,      // case-insensitive substring on display name
  codes_only?: boolean,     // only journals with a registered short code
  limit?:      number,      // 1–500, default 100
})
```

Returns `count`, `total_matched`, `truncated`, and a list with `code`,
`name`, `domain`, `tier`, `issn`.

---

### `paperazzi_resolve_entity`

Resolve a human-readable author or institution name to its OpenAlex
entity ID. Always call this before filtering `paperazzi_search` by
`author_ids` or `institution_ids`.

```text
paperazzi_resolve_entity({
  name:   string,                       // e.g. "Nicolas Pasquier" or "GAEL"
  type:   "author" | "institution",
  limit?: number,                       // 1–10, default 5
})
```

Returns ranked candidates with `openalex_id`, `name`, disambiguating
context (affiliation for authors; type/country for institutions), `works_count`,
and `cited_by_count`. If one match is obvious, proceed; otherwise ask the
user to pick.

---

### `paperazzi_citations`

Walk the citation graph around a single paper.

```text
paperazzi_citations({
  openalex_id: string,                       // e.g. "W2741809807" (from a search result)
  direction:   "cited_by" | "references",    // forward (who cites it) or backward (its refs)
  query?:      string,                       // optional free-text filter within the set
  limit?:      number,                       // 1–50, default 20
  sort?:       "relevance" | "citations" | "date",
})
```

Returns `count`, `total_count`, `focal_title`, and the paper list. Get
the `openalex_id` from a `paperazzi_search` result; if you only have a
title, search for it first.

---

### `paperazzi_get_paper`

Fetch one paper by its OpenAlex work ID or DOI. Useful when the user
pastes a specific paper, or to obtain the `openalex_id` that
`paperazzi_citations` requires.

```text
paperazzi_get_paper({
  id: string,  // "W2741809807", "10.1257/aer.20191000", "doi:…", or a doi.org URL
})
```

Returns `found`, `openalex_id`, title, authors, year, journal, DOI,
citations, references count, abstract, and PDF URL.

---

## Prompts

Prompts are user-invoked workflow templates surfaced as slash-commands in
clients that implement the MCP prompts capability (e.g. Claude Desktop).
They pull step-by-step guidance into context only when needed — keeping
tool descriptions lean.

| Prompt | What it does |
|---|---|
| `literature_review` | Survey a topic: seminal papers by citations + recent work by date |
| `author_recent_work` | Resolve an author name → latest papers, with affiliation disambiguation |
| `explore_citations` | Trace forward (cited_by) and backward (references) around one paper |
| `journal_panorama` | Landmark + recent work in a specific journal, domain, or tier |

---

## Adding it to a client

### Claude Desktop / Cowork

Edit your `claude_desktop_config.json` (on macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`). Add
an `mcpServers` block:

```json
{
  "mcpServers": {
    "paperazzi": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://paperazzi.vercel.app/api/mcp"]
    }
  }
}
```

This uses [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) — a
tiny bridge that turns the remote HTTP endpoint into a local stdio process.
Requires [Node.js](https://nodejs.org). Fully quit and reopen the app,
then try: *"Find me recent IO papers on platform competition."*

### Mistral Le Chat / ChatGPT / Cursor / Cline / Zed

Point your client's MCP settings at `https://paperazzi.vercel.app/api/mcp`
using the HTTP (Streamable HTTP) transport. ChatGPT and Le Chat may
require a paid plan.

---

## Running locally

```bash
npm install        # picks up mcp-handler, @modelcontextprotocol/sdk, zod
npm run dev
# endpoint: http://localhost:3000/api/mcp
```

Point a local Claude Desktop config at `http://localhost:3000/api/mcp`
to develop against your dev server.

---

## Architecture

- **Transport.** Streamable HTTP via [`mcp-handler`](https://github.com/vercel/mcp-handler),
  Vercel's official adapter around `@modelcontextprotocol/sdk`. Stateless
  — no Redis required.
- **Backend.** Tools dispatch in-process into the existing `/api/search`
  GET handler. No extra network hop, no logic duplication.
- **OpenAlex keys.** Reuses the same `OPENALEX_KEYS` rotation pool as the
  website — nothing extra to configure.
- **Auth.** None. To gate the endpoint, add a header check at the top of
  the `POST` export in `app/api/mcp/route.ts` before delegating to `handler`.
- **Annotations.** Every tool carries `readOnlyHint: true`, `destructiveHint: false`,
  `idempotentHint: true`, `openWorldHint: true` — clients can skip
  confirmation prompts for all Paperazzi calls.
- **Output schemas.** Every tool declares a typed `outputSchema` (Zod),
  enabling structured `structuredContent` responses alongside the Markdown
  text — useful for tool chaining.
