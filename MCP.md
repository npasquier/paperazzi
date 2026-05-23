# Paperazzi MCP server

Paperazzi exposes an [MCP](https://modelcontextprotocol.io/) endpoint at
`/api/mcp` so any MCP-capable LLM client can search peer-reviewed
economics papers through the same engine that powers the web app —
ranking-aware journal filtering, CNRS tier/domain whitelists, the lot.

The endpoint is **open**: no token, no account. The deployed URL is:

    https://paperazzi.vercel.app/api/mcp

> ⚠️ Currently only one tool is exposed: `paperazzi_search`. Citation
> traversal and pin/collection management are not in MCP scope yet —
> the link returned with each result opens the same query in Paperazzi
> where those features live.

---

## The tool

```text
paperazzi_search({
  query:         string,                         // required, e.g. "digital agriculture adoption"
  domains?:      ("OrgInd" | "Macro" | "Fin" | ...)[],   // CNRS domain codes
  tiers?:        ("1" | "2" | "3" | "4")[],      // CNRS tiers, 1 = top
  journal_names?: string[],                      // substring match, e.g. ["Econometrica"]
  top5_only?:    boolean,                        // AER, ECMA, JPE, QJE, ReStud
  year_from?:    number,
  year_to?:      number,
  limit?:        number,                         // 1..50, default 20
  sort?:         "relevance" | "citations" | "date",
})
```

Returns up to `limit` papers with title, authors, journal, year,
citation count, DOI, abstract, and a `share_url` that opens the same
search in the Paperazzi UI.

---

## Adding it to a client

### Claude Desktop / Cowork (free)

Edit your `claude_desktop_config.json` (on macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`). Add
an `mcpServers` block as a sibling of whatever's already in the file —
don't replace anything:

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
tiny bridge that turns the remote HTTP server into a local stdio process
the app can talk to. It's the most compatible config across app
versions; the native HTTP-transport JSON shape varies and isn't worth
chasing. Requires [Node.js](https://nodejs.org) on your machine
(`node --version` to check).

Fully quit and reopen the app. Ask: *"Find me recent papers on digital
agriculture in Industrial Organization journals."*

### Mistral Le Chat

Le Chat's connector/MCP UI is moving fast; check the current "Tools" or
"Connectors" panel in settings and add a custom MCP server pointing at
`https://paperazzi.vercel.app/api/mcp`. May require a paid plan
depending on the rollout state.

### ChatGPT (Plus / Team / Enterprise)

In a custom GPT or via the connectors panel, add a remote MCP server
with URL `https://paperazzi.vercel.app/api/mcp`. Requires a paid plan
at the time of writing.

### Cursor, Cline, Continue, Zed, etc.

All speak MCP. Point them at `https://paperazzi.vercel.app/api/mcp`
with the HTTP transport.

---

## Running locally

```bash
npm install        # picks up mcp-handler, @modelcontextprotocol/sdk, zod
npm run dev
```

The endpoint is then live at `http://localhost:3000/api/mcp`. Point a
local Claude Desktop config at that URL to develop against your dev
server.

---

## How it's wired

- **Transport.** Streamable HTTP via [`mcp-handler`](https://github.com/vercel/mcp-handler),
  Vercel's official adapter around `@modelcontextprotocol/sdk`. Stateless
  (no Redis required) — fine for request/response tools like ours.
- **Backend.** The MCP handler dispatches in-process into the existing
  `app/api/search` GET handler. No second network hop, no logic
  duplication. The CNRS scheme and ISSN resolution are imported from
  `data/cnrsScheme.ts` and `data/domains.ts`.
- **OpenAlex keys.** Reuses the same `OPENALEX_KEYS` rotation pool the
  website uses — nothing extra to configure.
- **Optional auth.** None. If you ever need to gate the endpoint, the
  cleanest place is a header check at the top of the `POST` export in
  `app/api/mcp/route.ts` before delegating to `handler`.

## Adding more tools

Open `app/api/mcp/route.ts` and add another `server.tool(...)` block
inside the `createMcpHandler` init function. Candidates worth
considering when you're ready:

- `paperazzi_cited_by(openalex_id)` — forward citation walk.
- `paperazzi_references(openalex_id)` — backward citation walk.
- `paperazzi_lookup_journal(name)` — return tier/domain/ISSN for a
  journal name, useful as a one-shot lookup before a filtered search.
