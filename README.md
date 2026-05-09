# Paperazzi

> Find papers that matter — a focused, citation-aware search tool for economics literature.

Paperazzi is a web app that searches academic papers via the [OpenAlex](https://openalex.org/) API and adds an economics-specific layer on top: CNRS journal categorization, forward + backward citation exploration, a year × log-citations citation network, and a per-collection pin sidebar with notes, keywords, and import/export.

🔗 **Live app:** <https://paperazzi.vercel.app>
📖 **About / methodology:** <https://paperazzi.vercel.app/about>

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Data flow](#data-flow)
- [Scripts](#scripts)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgements](#acknowledgements)

---

## Features

- **Economics-first journal filtering.** Filter results by CNRS-categorized economics journals (1, 1g, 2, 3, 4) or by saved ISSN whitelists (e.g. Top 5).
- **Forward + backward citation exploration.** From any result, search papers that cite it, papers it references, or visualise both as a network in year × log-citations space.
- **Pin sidebar with collections.** Pin papers into named libraries (e.g. *Job-market paper*, *Lit review – pricing*), drag-and-drop into colour-coded groups, and switch between collections without losing state.
- **Per-paper notes & keywords.** Annotate pinned papers with a free-text note and up to six tags; both round-trip through export/import.
- **Share & back up.** Export a single collection as a `.paperazzi-collection.json` file (shareable) or your entire library as a `.paperazzi-library.json` backup. Drop either kind anywhere on the page to import.
- **Author and institution search.** Click an author or institution name in any paper card to refocus the result list.
- **Saved searches.** Persist filter presets to localStorage so a recurring query is one click away.
- **Privacy-friendly.** No accounts, no server-side user database. All pins, notes, and preferences live in your browser's localStorage. The app's only outbound request is to the OpenAlex API.

## Tech stack

| Layer            | Choice                                         |
| ---------------- | ---------------------------------------------- |
| Framework        | [Next.js 16](https://nextjs.org) (App Router)  |
| Language         | TypeScript (strict)                            |
| UI               | React 19, Tailwind CSS v4, lucide-react icons  |
| Data source      | [OpenAlex](https://openalex.org/) REST API     |
| Persistence      | Browser localStorage                           |
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
| `OPEN_ALEX_API_KEY`   | No       | server    | Single OpenAlex API key, if you have one.                                     |
| `OPENALEX_KEYS`       | No       | server    | Comma-separated list of keys; the API route rotates through them.             |

A starter file lives at `.env.example` (do not commit `.env.local`).

## Project structure

```
paperazzi/
├── app/                       # Next.js App Router
│   ├── layout.tsx             # Root layout, fonts, providers, NavBar
│   ├── page.tsx               # Landing page
│   ├── about/                 # About / methodology page
│   ├── help/                  # Search-syntax help page
│   ├── search/                # Main search experience (uses PaperazziApp)
│   └── api/
│       └── search/            # /api/search route — proxies & shapes OpenAlex
│           ├── route.ts       #   entry; dispatches to handlers
│           ├── handlers/      #   one file per search mode
│           │   ├── regular.ts
│           │   ├── citingAll.ts
│           │   ├── referencedBy.ts
│           │   └── referencesAll.ts
│           └── lib/           #   fetch, format, key-rotation helpers
│
├── components/                # All UI components
│   ├── PaperazziApp.tsx       # Top-level client component for /search
│   ├── NavBar.tsx
│   ├── FilterPanel.tsx        # Left pane: query + filters + presets
│   ├── SearchResults.tsx      # Centre pane: result list + pagination
│   ├── PinSidebar.tsx         # Right pane: pinned papers, groups, collections
│   ├── CollectionImportDropzone.tsx  # Global drag-and-drop import overlay
│   ├── PaperInfoModal.tsx     # Paper detail modal (notes + keywords)
│   ├── AuthorModal.tsx
│   ├── InstitutionModal.tsx
│   ├── JournalModal.tsx       # Journal picker (lazy-loaded)
│   ├── StorageModal.tsx       # "What is stored in your browser" modal
│   ├── OnboardingOverlay.tsx
│   ├── ErrorBoundary.tsx
│   ├── EmptyState.tsx
│   ├── SearchSyntaxHelp.tsx
│   └── ui/                    # Reusable building blocks
│       ├── PaperCard.tsx      #   default / compact / pinned variants
│       ├── PinButton.tsx
│       ├── CitationsNetwork.tsx
│       └── CelebrationOverlay.tsx
│
├── contexts/
│   └── PinContext.tsx         # Pins, groups, collections, import/export
│
├── data/                      # Static datasets (CNRS rankings, ISSN lists)
│   ├── journals.ts
│   ├── journalAbbreviations.ts
│   ├── econDomains.ts
│   └── domains.ts
│
├── utils/
│   ├── pinCollectionTransfer.ts  # Export/import format + parser
│   ├── storageKeys.ts            # Single source of truth for localStorage keys
│   ├── eventBus.ts               # Tiny pub/sub (paper-citing-click, etc.)
│   ├── normalizeId.ts            # OpenAlex ID canonicalisation
│   ├── parsePapers.ts            # OpenAlex → Paper shape
│   ├── abstract.ts               # Inverted-index → text
│   ├── cleanHtml.ts              # Sanitize OpenAlex titles/abstracts
│   ├── searchCache.ts            # In-memory result cache
│   ├── queryMentions.ts          # @author / #journal mention parsing
│   ├── issnToJournals.ts
│   ├── loadJournals.ts
│   └── usePersistedBoolean.ts    # localStorage-backed boolean hook
│
├── types/
│   ├── interfaces.ts          # App-level types (Paper, PinGroup, Filters, …)
│   └── openalex.ts            # OpenAlex response shapes
│
├── public/                    # Static assets
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── postcss.config.mjs
└── package.json
```

## Data flow

```
        ┌────────────────┐  query    ┌──────────────────┐  fetch   ┌──────────┐
User → │ FilterPanel    │ ────────▶ │ /api/search      │ ───────▶ │ OpenAlex │
        │ (client)       │           │ (server route)   │          └──────────┘
        └────────────────┘           └──────────────────┘
                ▲                             │
                │ paper events                ▼ shaped JSON
        ┌────────────────┐           ┌──────────────────┐
        │ SearchResults  │ ◀──────── │ parsePapers      │
        └────────────────┘           └──────────────────┘
                │ pin
                ▼
        ┌────────────────────────────────────────────────┐
        │ PinContext (in-memory + debounced localStorage) │
        └────────────────────────────────────────────────┘
                │                          ▲
                ▼                          │
        ┌────────────────┐          drag-and-drop import
        │ PinSidebar     │ ─────────────────────────────── CollectionImportDropzone
        └────────────────┘
```

Persistence rules of thumb: anything user-authored (pins, groups, notes, keywords, presets, sidebar width) lives in `localStorage` under keys defined in `utils/storageKeys.ts`. Search results themselves are never persisted; only their cached IDs in the pin sidebar.

## Scripts

| Command          | What it does                                         |
| ---------------- | ---------------------------------------------------- |
| `npm run dev`    | Start the dev server with hot reload on `:3000`.     |
| `npm run build`  | Production build (`.next/`).                         |
| `npm run start`  | Serve the production build.                          |
| `npm run lint`   | Run ESLint over the project.                         |

## Contributing

Contributions and bug reports are welcome.

1. **Open an issue first** for non-trivial changes so we can scope the work together.
2. **Fork & branch.** Use a topic branch named after what you're doing (`feat/keyword-export`, `fix/cite-count-overflow`).
3. **Keep diffs focused.** One feature or one fix per pull request.
4. **Match the surrounding style.** TypeScript strict, no `any` unless documented, comments explain *why* (the *what* is in the code).
5. **Run before pushing:**
   ```bash
   npm run lint
   npx tsc --noEmit
   npm run build
   ```
6. **Open a pull request** against `main` with a clear description of what changed and why. Screenshots help for UI changes.

If you spot incorrect paper metadata, that's an OpenAlex data issue — see <https://help.openalex.org/hc/en-us/articles/27714298573719-Fix-errors-in-OpenAlex>.

## License

[MIT](./LICENSE) © Nicolas Pasquier.

## Acknowledgements

- **[OpenAlex](https://openalex.org/)** — the open scholarly metadata graph that powers every search.
- **[CNRS Section 37](https://www.gate.cnrs.fr/wp-content/uploads/2021/12/categorisation37_liste_juin_2020-2.pdf)** — the (2020) economics-journal categorisation used for filter tiers.
- **[ResearchRabbit](https://www.researchrabbit.ai/)** — popularised the year × log-citations citation network view.

Built by [Nicolas Pasquier](https://npasquier.github.io/), economics researcher at GAEL.
