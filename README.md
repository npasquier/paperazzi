# Paperazzi

> Find papers that matter — a focused, citation-aware search tool for economics literature.

Paperazzi is a web app that searches academic papers via the [OpenAlex](https://openalex.org/) API and adds a research workflow on top: editable journal ranking schemes, keyword search, forward + backward citation exploration, a year × log-citations citation network, and a per-collection pin sidebar with notes, keywords, and import/export. It also ships an [MCP](https://modelcontextprotocol.io/) server so LLM clients can drive the same ranking-aware search.

**Link to the app:** <https://paperazzi.vercel.app>

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Data flow](#data-flow)
- [MCP server](#mcp-server)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Features

- **Ranking-aware journal filtering.** Start with the built-in CNRS economics scheme, or fork, edit, import, export, and replace ranking schemes on `/rankings`. Journal filtering supports `Wide`, `Specific`, and `Off` modes plus saved journal filters such as `Top 5`.
- **Search bar shortcuts.** Type `@`, `#`, or `~` in the query bar to summon author / journal / institution autocomplete; `@name` and `#abbrev` also resolve directly on submit. The rest of the text is sent to OpenAlex's keyword search (supports Boolean operators, quoted phrases, wildcards, and proximity).
- **Forward + backward citation exploration.** From any result, search papers that cite it, papers it references, or visualize both as a network in year × log-citations space.
- **Pin sidebar with collections.** Pin papers into named libraries (e.g. *Job-market paper*, *Lit review – pricing*), drag-and-drop into colour-coded groups, and switch between collections without losing state.
- **Per-paper notes & keywords.** Annotate pinned papers with a free-text note and up to six tags; both round-trip through export/import.
- **Share & back up.** Export a single collection (`.paperazzi-collection.json`, shareable), your whole library (`.paperazzi-library.json`), or a full backup of every Paperazzi setting (`.paperazzi-backup.json`). Drop any of them anywhere on the page to import.
- **Author and institution search.** Click an author or institution name in any paper card to refocus the result list.
- **Saved searches.** Persist full search presets to localStorage so a recurring query is one click away.
- **MCP server for LLM clients.** An [MCP](https://modelcontextprotocol.io/) endpoint at `/api/mcp` exposes the same ranking-aware engine through two tools — `paperazzi_search` and `paperazzi_list_journals` — so Claude Desktop, Cursor, and other MCP clients can search economics literature directly. See [MCP.md](./MCP.md).
- **Privacy-friendly.** No accounts, no server-side user database. All pins, notes, and preferences live in your browser's localStorage; the app's only data source is the OpenAlex API (queried directly and via its own `/api/search` proxy), plus privacy-friendly Vercel Analytics.

## Tech stack

| Layer            | Choice                                         |
| ---------------- | ---------------------------------------------- |
| Framework        | [Next.js 16](https://nextjs.org) (App Router)  |
| Language         | TypeScript (strict)                            |
| UI               | React 19, Tailwind CSS v4, lucide-react icons  |
| Data source      | [OpenAlex](https://openalex.org/) REST API     |
| LLM integration  | MCP server (`@modelcontextprotocol/sdk` + `mcp-handler`) |
| Persistence      | Browser localStorage                           |
| Testing          | [Vitest](https://vitest.dev/)                  |
| Hosting          | Vercel                                         |

No database, no auth provider, no analytics other than [Vercel Analytics](https://vercel.com/docs/analytics).

## Getting started

### Prerequisites

- **Node.js 18.18+** (Next.js 16 requires Node 18.18 or newer; 20 LTS recommended).
- **npm** (ships with Node) — the lockfile is `package-lock.json`. Yarn / pnpm should work but are not the supported path.

### Install

```bash
git clone https://github.com/npasquier/paperazzi.git
cd paperazzi
npm install
```

> **Tip — native binding error:** if `npm test` fails with `Cannot find native binding` for `@rolldown/binding-darwin-arm64`, this is a [known npm bug](https://github.com/npm/cli/issues/4828) with optional dependencies. Fix it with:
> ```bash
> rm -rf node_modules package-lock.json && npm install
> ```

### Configure environment

Copy the template and fill it in:

```bash
cp .env.example .env.local
```

See [Environment variables](#environment-variables) for what each value does. The app will run without these — OpenAlex serves anonymous traffic — but supplying a `MAIL_ID` puts you in OpenAlex's "polite pool" with higher rate limits.

### Run

```bash
npm run dev
```

Open <http://localhost:3000>.

### Build for production

```bash
npm run build
npm run start
```

## Environment variables

| Name                  | Required | Where     | Purpose                                                                       |
| --------------------- | -------- | --------- | ----------------------------------------------------------------------------- |
| `MAIL_ID`             | No       | server    | Email passed to OpenAlex via `mailto=` to join the [polite pool](https://docs.openalex.org/how-to-use-the-api/api-overview#the-polite-pool). |
| `NEXT_PUBLIC_MAIL_ID` | No       | client    | Same email, used by client-side fetches to OpenAlex (e.g. modal abstract).    |
| `OPEN_ALEX_API_KEY`   | No       | server    | Legacy single OpenAlex API key; Paperazzi will use it as a fallback or merge it into the rotation pool. |
| `OPENALEX_KEYS`       | No       | server    | Comma-separated list of keys; the API route rotates through them (random start offset, round-robin) and the usage dashboard inspects them individually. |
| `NEXT_PUBLIC_BASE_URL`| No       | server    | Base URL used by the MCP server to build "open this search in Paperazzi" links. Falls back to `VERCEL_URL`, then the public deployment. |
| `USAGE_API_TOKEN`     | **Yes in prod** | server | Bearer token for the `/api/openalex/usage` endpoint. Without it the route returns 401 in production. Set to any long random string. |

A starter file lives at `.env.example` (do not commit `.env.local`).

## Project structure

```
paperazzi/
├── app/                       # Next.js App Router
│   ├── layout.tsx             # Root layout, fonts, providers, NavBar
│   ├── page.tsx               # Landing page
│   ├── about/                 # About / methodology page
│   ├── help/                  # User guide / workflow documentation
│   ├── rankings/              # Ranking-scheme editor and import/export page
│   ├── search/                # Main search experience (uses PaperazziApp)
│   └── api/
│       ├── search/            # /api/search route — proxies & shapes OpenAlex
│       │   ├── route.ts       #   entry; parses + validates params, dispatches to handlers
│       │   ├── context.ts     #   request context / shared params
│       │   ├── handlers/      #   one file per search mode
│       │   │   ├── regular.ts
│       │   │   ├── citingAll.ts
│       │   │   ├── referencedBy.ts
│       │   │   └── referencesAll.ts
│       │   └── lib/           #   fetch, format, searches, key-rotation helpers
│       ├── mcp/               # /api/mcp — MCP server (paperazzi_search, paperazzi_list_journals)
│       └── openalex/
│           └── usage/         # /api/openalex/usage — API-key budget/usage (token-gated)
│
├── components/                # All UI components
│   ├── PaperazziApp.tsx       # Top-level client component for /search
│   ├── NavBar.tsx             # Search bar, @/#/~ chips, dirty-state button
│   ├── FilterPanel.tsx        # Left pane: query + filters + presets
│   ├── SearchResults.tsx      # Centre pane: result list + pagination
│   ├── PinSidebar.tsx         # Right pane: pinned papers, groups, collections
│   ├── CollectionImportDropzone.tsx  # Global drag-and-drop import overlay
│   ├── PaperInfoModal.tsx     # Paper detail modal (notes + keywords)
│   ├── ContributeModal.tsx    # OpenAlex correction flow
│   ├── AuthorModal.tsx
│   ├── InstitutionModal.tsx
│   ├── JournalModal.tsx       # Journal picker (lazy-loaded)
│   ├── StorageModal.tsx       # "What is stored in your browser" modal
│   ├── OpenAlexUsageModal.tsx # API-key usage dashboard (Cmd/Ctrl+Shift+U)
│   ├── OnboardingOverlay.tsx
│   ├── ErrorBoundary.tsx
│   ├── EmptyState.tsx
│   ├── SearchSyntaxHelp.tsx   # Keyword syntax + shortcut help
│   ├── rankings/
│   │   └── RankingsEditor.tsx # Split into ~11 focused modules under rankings/
│   └── ui/                    # Reusable building blocks
│       ├── PaperCard.tsx      #   default / compact / pinned variants
│       ├── PinButton.tsx
│       ├── CitationsNetwork.tsx
│       └── CelebrationOverlay.tsx
│
├── contexts/
│   └── PinContext.tsx         # Pins, groups, collections context + usePins hook
│                              # (delegates storage/CRUD to hooks/usePinStorage
│                              #  and hooks/useCollectionManager)
│
├── hooks/                     # Standalone React hooks (no component coupling)
│   ├── useNavBarAutocomplete.ts  # @/#/~ autocomplete state, paging, selectMention
│   ├── useNavBarChips.ts         # Chip state, event-bus sync, dirty signals
│   ├── usePinStorage.ts          # Debounced localStorage write + flush/cancel
│   ├── useCollectionManager.ts   # Collection CRUD + export/import callbacks
│   ├── usePinSelection.ts        # Multi-select state for PinSidebar
│   ├── usePinDragDrop.ts         # Drag-and-drop state machine for PinSidebar
│   ├── useSidebarResize.ts       # Resizable sidebar width (module-level store)
│   ├── useDismissablePopover.ts  # Generic outside-click dismissal
│   ├── useFilterPresets.ts       # Saved-search + journal-preset persistence
│   ├── usePaperSearch.ts         # List fetch + loading UX for SearchResults
│   ├── useCitationBanners.ts     # Citation count banners
│   ├── useNetworkView.ts         # Citation network view state
│   └── useAuthorPanel.ts         # Author panel state + reported-flag store
│
├── tests/                     # Vitest test suite (run with `npm test`)
│   ├── econBatchedSearch.test.ts  # H1 pagination regression (8 batch × page combos)
│   ├── format.test.ts             # buildFilters / buildSort / mapToPapers
│   ├── abstract.test.ts           # Abstract reconstruction + M6 position-clamp
│   └── searchRoute.test.ts        # /api/search validation (400 paths, sanitisation)
│
├── data/                      # Static datasets (CNRS scheme, journals, abbreviations)
│   ├── cnrsScheme.ts
│   ├── journals.ts
│   ├── journalAbbreviations.ts
│   └── domains.ts
│
├── utils/
│   ├── activeRanking.ts          # Active ranking loader / resolver
│   ├── pinCollectionTransfer.ts  # Export/import format + parser
│   ├── pinStorage.ts             # Pure localStorage helpers for PinContext
│   │                             # (readJSON/writeJSON, ensureBootstrapped, …)
│   ├── storageKeys.ts            # Single source of truth for localStorage keys
│   ├── eventBus.ts               # Tiny pub/sub (paper-citing-click, etc.)
│   ├── normalizeId.ts            # OpenAlex ID canonicalisation
│   ├── openAlexClient.ts         # Client OpenAlex fetch (polite-pool mailto)
│   ├── abstract.ts               # Inverted-index → text
│   ├── cleanHtml.ts              # Sanitize OpenAlex titles/abstracts
│   ├── correctionForms.ts        # OpenAlex correction-form links
│   ├── migrateFilters.ts         # Filter-shape migrations
│   ├── filtersEqual.ts           # Structural Filters comparator
│   ├── searchCache.ts            # In-memory result cache (LRU, inflight dedup)
│   ├── queryMentions.ts          # @author / #journal shortcut parsing
│   ├── loadJournals.ts           # Journal loading / ISSN resolution
│   ├── download.ts               # triggerDownload helper
│   └── usePersistedBoolean.ts    # localStorage-backed boolean (useSyncExternalStore)
│
├── types/
│   ├── interfaces.ts          # App-level types (Paper, PinGroup, Filters, …)
│   └── openalex.ts            # OpenAlex response shapes
│
├── public/                    # Static assets
├── MCP.md                     # MCP server setup + client wiring guide
├── CODE_AUDIT.md              # Security + architecture audit log with fix history
├── vitest.config.ts           # Vitest config
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
└── package.json
```

### Key architectural boundaries

- **`app/api/`** is the only server-side code. Everything else runs in the browser.
- **`hooks/`** contains pure logic hooks with no JSX. Components import from here; hooks never import from components.
- **`utils/`** contains framework-agnostic helpers. Pure functions in `utils/pinStorage.ts` are safe to import in Vitest tests without React setup.
- **`contexts/PinContext.tsx`** owns the React tree for pinning but delegates its two hardest sub-problems — debounced writes (`usePinStorage`) and collection CRUD (`useCollectionManager`) — to dedicated hooks so each concern is independently testable and readable.

## Data flow

```
        ┌──────────────────────────┐  query / shortcuts   ┌──────────────────┐  fetch   ┌──────────┐
User →  │ NavBar + FilterPanel      │ ──────────────────▶ │ /api/search      │ ───────▶ │ OpenAlex │
        │ (client)                 │                      │ (server route)   │          └──────────┘
        └──────────────────────────┘                      └──────────────────┘
                    ▲                                               │
                    │ paper events                                  ▼ shaped JSON
        ┌──────────────────────────┐                      ┌──────────────────┐
        │ SearchResults            │ ◀─────────────────── │ mapToPapers      │
        └──────────────────────────┘                      └──────────────────┘
                    │ pin
                    ▼
        ┌──────────────────────────────────────────────────────────────┐
        │ PinContext (in-memory state + debounced localStorage sync)   │
        └──────────────────────────────────────────────────────────────┘
                    │                                   ▲
                    ▼                                   │
        ┌────────────────┐                     drag-and-drop import
        │ PinSidebar     │ ─────────────────────────────────────────── CollectionImportDropzone
        └────────────────┘
```

`NavBar` resolves `@author` and `#journal` shortcuts client-side (via `useNavBarAutocomplete`) before pushing the search URL. Ranking-aware journal filters are resolved locally to ISSNs, then sent as normal search params to `/api/search`. The server stays scheme-agnostic — it only ever receives the final ISSN whitelist. Browser-side calls straight to OpenAlex (autocomplete, citation-banner metadata, pin refresh) go through `utils/openAlexClient.ts` so they consistently carry the polite-pool `mailto`; the `/api/search` proxy authenticates with the rotated `OPENALEX_KEYS` pool instead.

The MCP server (`/api/mcp`) dispatches into the same `/api/search` handler in-process, so LLM clients get identical results without a second network hop.

Persistence rules of thumb: anything user-authored (pins, groups, notes, keywords, saved searches, saved journal filters, ranking schemes, sidebar width) lives in `localStorage` under keys defined in `utils/storageKeys.ts`. Search results themselves are never persisted; only their cached IDs in the pin sidebar.

## MCP server

Paperazzi exposes a [Model Context Protocol](https://modelcontextprotocol.io/) endpoint at `/api/mcp` so any MCP-capable LLM client can run the same ranking-aware search the web app uses. Two tools are registered:

- `paperazzi_search` — search peer-reviewed economics/management papers with CNRS domain, tier, journal-code, and Top-5 filters, plus year/sort controls. Returns ranked results plus a link that reopens the query in the Paperazzi UI.
- `paperazzi_list_journals` — list the journals Paperazzi knows about (short code, CNRS domain, tier, ISSN), for discovering exact names/codes before filtering.

The endpoint is open (no token) and reuses the `OPENALEX_KEYS` rotation pool. Full setup — including ready-to-paste configs for Claude Desktop, Cursor, and others — lives in [MCP.md](./MCP.md).

## Scripts

| Command              | What it does                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `npm run dev`        | Start the dev server with hot reload on `:3000`.                        |
| `npm run build`      | Production build (`.next/`).                                            |
| `npm run start`      | Serve the production build.                                             |
| `npm run lint`       | Run ESLint over the project.                                            |
| `npm test`           | Run the full Vitest test suite once (43 tests across 4 files).          |
| `npm run test:watch` | Run Vitest in watch mode (re-runs on file save — useful during development). |
| `npm run check`      | Typecheck + lint + tests in one shot — the recommended pre-push gate.   |

### What the tests cover

The test suite lives in `tests/` and is focused on the server-side logic where bugs have real cost:

- **`econBatchedSearch.test.ts`** — pagination correctness across 8 batch-layout × page-size combinations, including the H1 regression (mid-batch offset was silently dropping results).
- **`format.test.ts`** — `buildFilters`, `buildSort`, `mapToPapers`, and query-param sanitisation.
- **`abstract.test.ts`** — inverted-index reconstruction, including the M6 position-clamp regression.
- **`searchRoute.test.ts`** — `/api/search` 400 paths (all fire before any upstream call) and the upstream URL sanitisation.

To add a test, create a `*.test.ts` file anywhere under `tests/`. Vitest picks it up automatically. The pure helpers in `utils/` (e.g. `pinStorage.ts`, `abstract.ts`, `normalizeId.ts`) have no React or Next.js dependencies and can be imported directly in tests without any special setup.

## Contributing

Contributions and bug reports are welcome.

1. **Open an issue first** for non-trivial changes so we can scope the work together.
2. **Fork & branch.** Use a topic branch named after what you're doing (`feat/keyword-export`, `fix/cite-count-overflow`).
3. **Keep diffs focused.** One feature or one fix per pull request.
4. **Match the surrounding style.** TypeScript strict, no `any` unless documented, comments explain *why* (the *what* is in the code).
5. **Run before pushing:**
   ```bash
   npm run check   # typecheck + lint + tests in one shot
   ```
6. **Open a pull request** against `main` with a clear description of what changed and why. Screenshots help for UI changes.

If you spot incorrect paper metadata, that's an OpenAlex data issue — see <https://help.openalex.org/hc/en-us/articles/27714298573719-Fix-errors-in-OpenAlex>.

## License

[MIT](./LICENSE) © Nicolas Pasquier.

## Acknowledgements

- **[OpenAlex](https://openalex.org/)** — the open scholarly metadata graph that powers every search.
- **[CNRS Section 37](https://www.gate.cnrs.fr/wp-content/uploads/2021/12/categorisation37_liste_juin_2020-2.pdf)** — the (2020) economics-journal categorisation used for filter tiers.

Built by [Nicolas Pasquier](https://npasquier.github.io/), economics researcher at GAEL, with [Claude Opus and Claude Fable](https://www.anthropic.com/claude) (Anthropic) as AI pair-programming assistants throughout development.
