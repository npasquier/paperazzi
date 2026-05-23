import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Bookmark,
  ChevronDown,
  Compass,
  Database,
  Download,
  Filter,
  Flag,
  Lightbulb,
  ListOrdered,
  Network,
  Pin,
  Plug,
  Search,
  StickyNote,
  Tag,
  Terminal,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import {
  AUTHOR_CORRECTION_FORM_URL,
  OPENALEX_FIX_ERRORS_URL,
  PAPER_CORRECTION_FORM_URL,
} from '@/utils/correctionForms';
import { JOURNAL_SHORTCUTS_LIST } from '@/data/journalAbbreviations';

type JumpLink = {
  id: string;
  icon: LucideIcon;
  title: string;
  body: string;
};

type QuickStartStep = {
  step: string;
  title: string;
  body: ReactNode;
};

type DocSectionProps = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  art?: ReactNode;
  children: ReactNode;
};

const jumpLinks: JumpLink[] = [
  {
    id: 'quick-start',
    icon: Compass,
    title: 'Quick start',
    body: 'The fastest first run through the app.',
  },
  {
    id: 'filters',
    icon: Filter,
    title: 'Filters',
    body: 'Journals, authors, institutions, type, date, and sort.',
  },
  {
    id: 'syntax',
    icon: AtSign,
    title: 'Search syntax',
    body: '@/#/~ shortcuts, the ~ typing tip, and OpenAlex operators.',
  },
  {
    id: 'rankings',
    icon: ListOrdered,
    title: 'Rankings',
    body: 'How journal schemes power the Wide filter.',
  },
  {
    id: 'network',
    icon: Network,
    title: 'Network view',
    body: 'References, citing papers, and citation paths.',
  },
  {
    id: 'pinned',
    icon: Pin,
    title: 'Pinboard',
    body: 'Collections, notes, keywords, and groups.',
  },
  {
    id: 'share',
    icon: Download,
    title: 'Import / export',
    body: 'Backups and portable project bundles.',
  },
  {
    id: 'contribute',
    icon: Flag,
    title: 'Improve OpenAlex',
    body: 'Report missing or incorrect data.',
  },
  {
    id: 'mcp',
    icon: Plug,
    title: 'Connect an LLM',
    body: 'Use Paperazzi from Claude, ChatGPT, Cursor, and other MCP clients.',
  },
  {
    id: 'tips',
    icon: Lightbulb,
    title: 'Workflow tips',
    body: 'A few good patterns once you know the basics.',
  },
];

const quickStartSteps: QuickStartStep[] = [
  {
    step: '1',
    title: 'Search broadly',
    body: (
      <>
        Type a query in the navbar, for example <em>endogenous growth</em>, and
        hit Enter.
      </>
    ),
  },
  {
    step: '2',
    title: 'Tighten the journals',
    body: (
      <>
        In the left filter panel, switch the Journals tab to{' '}
        <strong>Wide</strong> and click <strong>Top 5</strong>.
      </>
    ),
  },
  {
    step: '3',
    title: 'Open the map',
    body: (
      <>
        Click <strong>see network</strong> on any paper card to explore its
        citation neighborhood.
      </>
    ),
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className='rounded-md border border-app bg-[var(--background-card)] px-1.5 py-0.5 text-[11px] font-mono text-stone-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'>
      {children}
    </kbd>
  );
}

function JumpCard({ id, icon: Icon, title, body }: JumpLink) {
  return (
    <a
      href={`#${id}`}
      className='group surface-card rounded-xl border border-app p-4 transition hover:border-app-strong hover:bg-[var(--background-card)]'
    >
      <div className='flex items-start justify-between gap-4'>
        <span className='inline-flex h-10 w-10 items-center justify-center rounded-xl surface-muted text-stone-600'>
          <Icon size={18} />
        </span>
        <ArrowRight
          size={16}
          className='mt-1 text-stone-400 transition-colors group-hover:text-stone-700'
        />
      </div>
      <h3 className='mt-4 text-sm font-semibold text-stone-900'>{title}</h3>
      <p className='mt-2 text-sm leading-relaxed text-stone-600'>{body}</p>
    </a>
  );
}

function DocSection({
  id,
  icon: Icon,
  eyebrow,
  title,
  intro,
  art,
  children,
}: DocSectionProps) {
  return (
    <section id={id} className='scroll-mt-24'>
      <div className='surface-card rounded-2xl border border-app p-6 sm:p-8 shadow-[0_10px_24px_-22px_rgba(31,26,20,0.45)]'>
        <div
          className={
            art
              ? 'grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_290px] xl:items-start'
              : 'space-y-6'
          }
        >
          <div className='space-y-6'>
            <div className='space-y-4'>
              <div className='inline-flex items-center gap-2 rounded-full surface-muted border border-app px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500'>
                <Icon size={14} className='text-accent' />
                {eyebrow}
              </div>
              <div className='max-w-3xl'>
                <h2 className='text-2xl font-semibold tracking-tight text-stone-900 sm:text-[2rem]'>
                  {title}
                </h2>
                <div className='mt-3 text-sm leading-relaxed text-stone-600 sm:text-[15px]'>
                  {intro}
                </div>
              </div>
            </div>
            {children}
          </div>
          {art ? <div>{art}</div> : null}
        </div>
      </div>
    </section>
  );
}

function ArtFrame({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className='relative overflow-hidden rounded-2xl border border-app surface-panel p-4 shadow-[0_10px_24px_-22px_rgba(31,26,20,0.4)]'>
      <div
        className='absolute inset-x-0 top-0 h-16 opacity-60'
        style={{
          background:
            'linear-gradient(180deg, rgba(15, 118, 110, 0.08), transparent)',
        }}
      />
      <div className='relative'>
        <p className='text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400'>
          {label}
        </p>
        <p className='mt-1 text-sm font-medium text-stone-900'>{title}</p>
        <div className='mt-4'>{children}</div>
      </div>
    </div>
  );
}

function HeroArtwork() {
  return (
    <div className='w-full max-w-2xl'>
      <div className='surface-panel overflow-hidden rounded-xl border border-app'>
        <div className='flex h-10 items-center border-b border-app surface-card px-4'>
          <div className='h-2 w-20 rounded surface-subtle' />
          <div className='mx-8 flex-1'>
            <div className='mx-auto h-6 max-w-xs rounded border border-app surface-muted' />
          </div>
          <div className='h-2 w-16 rounded surface-subtle' />
        </div>

        <div className='flex h-52'>
          <div className='w-1/4 border-r border-app surface-card p-3'>
            <div className='mb-3 flex items-center gap-1.5'>
              <Filter size={12} className='text-stone-400' />
              <span className='text-xs text-stone-500'>Filters</span>
            </div>
            <div className='space-y-2'>
              <div className='h-2 w-full rounded surface-muted' />
              <div className='h-2 w-3/4 rounded surface-muted' />
              <div className='h-2 w-5/6 rounded surface-muted' />
            </div>
          </div>

          <div className='flex-1 p-3'>
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className='h-11 rounded-lg border border-app surface-card'
                />
              ))}
            </div>
          </div>

          <div className='w-1/4 border-l border-app surface-card p-3'>
            <div className='mb-3 flex items-center gap-1.5'>
              <Pin size={12} className='text-warning' />
              <span className='text-xs text-stone-500'>Pinned</span>
            </div>
            <div className='space-y-2'>
              <div className='h-8 rounded banner-warning' />
              <div className='h-8 rounded border border-dashed border-app surface-muted' />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterArtwork() {
  return (
    <ArtFrame label='Preview' title='Search panel'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.8)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>Journals</p>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              Wide
            </span>
          </div>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Top 5
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Tier 1
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Macro
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.8)] p-3'>
          <p className='text-xs font-medium text-stone-900'>
            Authors & institutions
          </p>
          <div className='mt-3 space-y-2'>
            <div className='h-8 rounded-full surface-muted' />
            <div className='h-8 rounded-full surface-muted' />
          </div>
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.8)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>Date & sort</p>
            <span className='rounded-full bg-[var(--success-bg)] px-2 py-1 text-[10px] text-success'>
              Most cited
            </span>
          </div>
          <div className='mt-3 space-y-2'>
            <div className='h-2 rounded-full bg-[var(--accent)]/25' />
            <div className='flex gap-2'>
              <div className='h-7 flex-1 rounded-full surface-muted' />
              <div className='h-7 flex-1 rounded-full surface-muted' />
            </div>
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

function SavedArtwork() {
  return (
    <ArtFrame label='Preview' title='Saved states'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>Saved search</p>
            <Bookmark size={14} className='text-stone-400' />
          </div>
          <div className='mt-3 space-y-2'>
            <div className='h-2 w-4/5 rounded-full bg-[var(--foreground-soft)]/35' />
            <div className='flex flex-wrap gap-1.5'>
              <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
                query
              </span>
              <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
                authors
              </span>
              <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
                dates
              </span>
            </div>
          </div>
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>
              Saved journal filter
            </p>
            <Filter size={14} className='text-stone-400' />
          </div>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            <span className='rounded-full banner-warning px-2 py-1 text-[10px] text-warning'>
              Wide
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Top 5
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              field journals
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-dashed border-app-strong px-3 py-3 text-xs leading-relaxed text-stone-500'>
          Both are stored locally, capped at 3 presets each, and meant to help
          you get back to a familiar slice of the literature quickly.
        </div>
      </div>
    </ArtFrame>
  );
}

function RankingsArtwork() {
  return (
    <ArtFrame label='Preview' title='Ranking scheme'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <p className='text-xs font-medium text-stone-900'>Tier chips</p>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              1
            </span>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              2
            </span>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              3
            </span>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              4
            </span>
          </div>
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <p className='text-xs font-medium text-stone-900'>Domain chips</p>
          <div className='mt-3 flex flex-wrap gap-1.5'>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              GEN
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Macro
            </span>
            <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
              Theory
            </span>
          </div>
        </div>
        <div className='overflow-hidden rounded-2xl border border-app bg-[#f7f1e5]'>
          <div className='border-b border-app px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400'>
            ranking.json
          </div>
          <pre className='overflow-x-auto px-3 py-3 text-[11px] leading-relaxed text-stone-600'>
            {`{
  "tiers": [{ "key": "1" }],
  "domains": [{ "key": "GEN" }],
  "journals": [{ "issn": "0002-8282" }]
}`}
          </pre>
        </div>
      </div>
    </ArtFrame>
  );
}

function NetworkArtwork() {
  return (
    <ArtFrame label='Preview' title='Network view'>
      <div className='rounded-[24px] border border-app bg-[rgba(255,253,248,0.82)] p-3'>
        <svg viewBox='0 0 260 220' className='w-full'>
          <path
            d='M48 144 L108 86 L154 120 L214 54'
            fill='none'
            stroke='#b7a489'
            strokeWidth='2'
          />
          <path
            d='M108 86 L88 48 L154 120 L188 154'
            fill='none'
            stroke='#d8ccb8'
            strokeWidth='1.6'
          />
          <path
            d='M108 86 L178 88'
            fill='none'
            stroke='#8b73bf'
            strokeWidth='2'
          />
          <circle
            cx='108'
            cy='86'
            r='18'
            fill='#dcefeb'
            stroke='#0f766e'
            strokeWidth='2.5'
          />
          <circle cx='48' cy='144' r='8' fill='#d8ccb8' />
          <circle cx='88' cy='48' r='7' fill='#d8ccb8' />
          <circle cx='154' cy='120' r='8' fill='#d8ccb8' />
          <circle cx='178' cy='88' r='7' fill='#cfc3ea' />
          <circle cx='188' cy='154' r='7' fill='#d8ccb8' />
          <circle cx='214' cy='54' r='8' fill='#d8ccb8' />
        </svg>
        <div className='mt-3 flex flex-wrap gap-2'>
          <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
            focal paper
          </span>
          <span className='rounded-full banner-analysis px-2 py-1 text-[10px] text-analysis'>
            pinned path
          </span>
          <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
            filters still apply
          </span>
        </div>
      </div>
    </ArtFrame>
  );
}

function LibraryArtwork() {
  return (
    <ArtFrame label='Preview' title='Pinboard and collections'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>
              Project collection
            </p>
            <span className='rounded-full bg-[var(--success-bg)] px-2 py-1 text-[10px] text-success'>
              8 pins
            </span>
          </div>
          <div className='mt-3 space-y-2'>
            <div className='rounded-xl border border-app pl-2'>
              <div className='border-l-[3px] border-[#d1a65b] px-3 py-2'>
                <div className='h-2 w-5/6 rounded-full bg-[var(--foreground-soft)]/35' />
                <div className='mt-2 flex gap-1.5'>
                  <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
                    note
                  </span>
                  <span className='rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px] text-stone-600'>
                    RCT
                  </span>
                </div>
              </div>
            </div>
            <div className='rounded-xl border border-app pl-2'>
              <div className='border-l-[3px] border-[#8cb7a0] px-3 py-2'>
                <div className='h-2 w-2/3 rounded-full bg-[var(--foreground-soft)]/30' />
              </div>
            </div>
          </div>
        </div>
        <div className='grid grid-cols-2 gap-3'>
          <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3 text-xs text-stone-600'>
            Groups add color and order.
          </div>
          <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3 text-xs text-stone-600'>
            Notes and keywords stay with each collection.
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

function ShareArtwork() {
  return (
    <ArtFrame label='Preview' title='Import and export'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>Export</p>
            <Download size={14} className='text-stone-400' />
          </div>
          <div className='mt-3 rounded-xl border border-dashed border-app-strong px-3 py-4 text-xs text-stone-600'>
            <code>.paperazzi-collection.json</code>
          </div>
        </div>
        <div className='flex items-center justify-center text-stone-400'>
          <ArrowRight size={16} />
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>Import</p>
            <Upload size={14} className='text-stone-400' />
          </div>
          <div className='mt-3 rounded-xl banner-success px-3 py-4 text-xs text-success'>
            New collection appears without touching the existing ones.
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

function ContributeArtwork() {
  return (
    <ArtFrame label='Preview' title='Correction flow'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center gap-2'>
            <span className='inline-flex h-8 w-8 items-center justify-center rounded-full banner-warning text-warning'>
              <Flag size={14} />
            </span>
            <p className='text-xs font-medium text-stone-900'>Flag a paper</p>
          </div>
          <div className='mt-3 h-10 rounded-xl surface-muted' />
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <p className='text-xs font-medium text-stone-900'>
            Submit correction
          </p>
          <div className='mt-3 space-y-2'>
            <div className='h-2 rounded-full bg-[var(--foreground-soft)]/30' />
            <div className='h-2 w-5/6 rounded-full bg-[var(--foreground-soft)]/25' />
            <div className='rounded-xl banner-info px-3 py-2 text-[10px] text-accent-strong'>
              OpenAlex ID copied and ready to paste
            </div>
          </div>
        </div>
      </div>
    </ArtFrame>
  );
}

function McpArtwork() {
  return (
    <ArtFrame label='Integration' title='LLM clients → Paperazzi'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <p className='text-xs font-medium text-stone-900'>MCP clients</p>
          <div className='mt-3 grid grid-cols-2 gap-1.5 text-[11px] text-stone-600'>
            <div className='rounded-xl surface-muted px-2.5 py-1.5'>
              Claude Desktop
            </div>
            <div className='rounded-xl surface-muted px-2.5 py-1.5'>
              ChatGPT
            </div>
            <div className='rounded-xl surface-muted px-2.5 py-1.5'>Cursor</div>
            <div className='rounded-xl surface-muted px-2.5 py-1.5'>
              Le Chat &amp; others
            </div>
          </div>
        </div>
        <div className='flex items-center justify-center'>
          <ArrowDown size={14} className='text-stone-400' />
        </div>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center justify-between gap-3'>
            <p className='text-xs font-medium text-stone-900'>
              /api/mcp endpoint
            </p>
            <span className='rounded-full banner-info px-2 py-1 text-[10px] text-accent-strong'>
              Streamable HTTP
            </span>
          </div>
          <div className='mt-3 rounded-xl surface-muted px-3 py-2 text-[11px] font-mono text-stone-700'>
            paperazzi_search(...)
          </div>
        </div>
        <div className='rounded-2xl border border-dashed border-app-strong px-3 py-3 text-xs leading-relaxed text-stone-500'>
          The same search backend the website uses — CNRS tier and domain
          filters included.
        </div>
      </div>
    </ArtFrame>
  );
}

function StorageArtwork() {
  return (
    <ArtFrame label='Storage' title='Local data'>
      <div className='space-y-3'>
        <div className='rounded-2xl border border-app bg-[rgba(255,253,248,0.82)] p-3'>
          <div className='flex items-center gap-2'>
            <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface-muted)] text-stone-600'>
              <Database size={14} />
            </span>
            <p className='text-xs font-medium text-stone-900'>Stored locally</p>
          </div>
          <div className='mt-3 space-y-2 text-[11px] text-stone-600'>
            <div className='rounded-xl surface-muted px-3 py-2'>
              saved searches
            </div>
            <div className='rounded-xl surface-muted px-3 py-2'>
              pinboard + groups
            </div>
            <div className='rounded-xl surface-muted px-3 py-2'>
              reported flags + UI state
            </div>
          </div>
        </div>
        <div className='rounded-2xl banner-warning px-3 py-3 text-xs leading-relaxed text-warning'>
          Clearing everything is possible, but it is destructive unless you
          exported first.
        </div>
      </div>
    </ArtFrame>
  );
}

export default function HelpPage() {
  return (
    <main className='app-scrollbar h-full overflow-y-auto bg-[var(--background)]'>
      <div className='mx-auto max-w-5xl px-6 py-12 lg:py-14'>
        <section className='grid gap-10 lg:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] lg:items-center'>
          <div className='max-w-xl'>
            <p className='text-sm text-stone-400'>Help</p>
            <h1 className='mt-4 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl'>
              Using Paperazzi
            </h1>
            <p className='mt-4 text-base leading-relaxed text-stone-600'>
              A practical guide to searching, filtering, exploring citation
              networks, and organizing papers in Paperazzi.
            </p>

            
          </div>

          <HeroArtwork />
        </section>

        <section className='mt-10'>
          <div className='mb-4 flex items-center gap-2 text-stone-600'>
            <Search size={16} className='text-stone-400' />
            <p className='text-sm font-medium'>Sections</p>
          </div>
          <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
            {jumpLinks.map((link) => (
              <JumpCard key={link.id} {...link} />
            ))}
          </div>
        </section>

        <div className='mt-10 space-y-8'>
          <DocSection
            id='quick-start'
            icon={Compass}
            eyebrow='Quick start'
            title='Quick start'
            intro={
              <p>
                The best first run is simple: search broadly, narrow the
                journals, then open a citation neighborhood. It gets you to a
                focused, high-quality slice of the literature in minutes.
              </p>
            }
            art={<FilterArtwork />}
          >
            <div className='grid gap-4 md:grid-cols-3'>
              {quickStartSteps.map(({ step, title, body }) => (
                <article
                  key={step}
                  className='surface-panel rounded-2xl border border-app p-5'
                >
                  <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-app-inverse'>
                    {step}
                  </span>
                  <h3 className='mt-4 text-base font-semibold text-stone-900'>
                    {title}
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    {body}
                  </p>
                </article>
              ))}
            </div>

            <div className='rounded-2xl banner-info p-4'>
              <p className='text-sm leading-relaxed text-accent-strong'>
                Three moves gets you from a broad idea to a literature view that
                is small enough to inspect and rich enough to explore.
              </p>
            </div>
          </DocSection>

          <DocSection
            id='filters'
            icon={Filter}
            eyebrow='Search controls'
            title='The filter panel'
            intro={
              <p>
                Search starts broad, but the left panel is where Paperazzi
                becomes specific. Most changes apply live, so the app feels
                closer to tuning a workspace than filling out a form.
              </p>
            }
            art={<FilterArtwork />}
          >
              <div className='grid gap-4 lg:grid-cols-[1.15fr_0.85fr]'>
                <article className='surface-panel rounded-2xl border border-app p-4'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    Journals
                  </h3>
                  <p className='mt-1.5 text-sm leading-relaxed text-stone-700'>
                    The Journals section has three modes.
                  </p>

                  <div className='mt-4 overflow-hidden rounded-2xl border border-app bg-[rgba(255,253,248,0.82)]'>
                    <div className='grid gap-2 border-b border-app px-4 py-3 md:grid-cols-[88px_minmax(0,1fr)] md:gap-3'>
                      <div>
                        <span className='inline-flex rounded-full banner-info px-2.5 py-1 text-xs font-medium text-accent-strong'>
                          Wide
                        </span>
                      </div>
                      <p className='text-sm leading-relaxed text-stone-600'>
                        Preset pills and tier/domain rows come from the active
                        ranking scheme on{' '}
                        <Link
                          href='/rankings'
                          className='underline underline-offset-2 hover:text-stone-900'
                        >
                          /rankings
                        </Link>{' '}
                        page.
                      </p>
                    </div>

                    <div className='grid gap-2 border-b border-app px-4 py-3 md:grid-cols-[88px_minmax(0,1fr)] md:gap-3'>
                      <div>
                        <span className='inline-flex rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-stone-700'>
                          Specific
                        </span>
                      </div>
                      <p className='text-sm leading-relaxed text-stone-600'>
                        Pick journals by name. Changes apply live.
                      </p>
                    </div>

                    <div className='grid gap-2 px-4 py-3 md:grid-cols-[88px_minmax(0,1fr)] md:gap-3'>
                      <div>
                        <span className='inline-flex rounded-full bg-[var(--surface-subtle)] px-2.5 py-1 text-xs font-medium text-stone-700'>
                          Off
                        </span>
                      </div>
                      <p className='text-sm leading-relaxed text-stone-600'>
                        Disables journal filtering while preserving your Wide and
                        Specific selections.
                      </p>
                    </div>
                  </div>

                  <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                    Sessions start in <em>Off</em>. Returning to Wide or
                    Specific restores the previous selection for that mode.
                  </p>
                </article>

                <div className='flex flex-col gap-4 lg:h-full lg:justify-between'>
                  <article className='surface-panel rounded-2xl border border-app p-5'>
                    <h3 className='text-base font-semibold text-stone-900'>
                      Authors and institutions
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Both work like Specific journals: open the picker, search by
                    name, and add as many as you want. Multiple authors filter
                    to papers where <em>any</em> of them is listed; the same
                    goes for institutions.
                  </p>
                </article>

                <article className='surface-panel rounded-2xl border border-app p-5'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    Type, date, sort
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Filter by publication type, bound by year range, and sort by
                    Relevance, Most Recent, Most Cited, or Oldest First. Sort
                    also affects which papers are eligible for the network view
                    when a result set exceeds a page.
                  </p>
                </article>
              </div>

                {/* Brief pointer to the dedicated Search syntax
                    section below. The full reference (shortcut
                    prefixes, the ~ typing tip, OpenAlex operators,
                    the journal-abbreviation catalog) lives there as
                    its own jump-card so it's discoverable from the
                    table of contents. We keep a one-line teaser here
                    because the Filters section is where most users
                    first ask "can I filter inline from the query
                    bar?" — the answer should be in their line of
                    sight, with a link to the deep dive. */}
                <div className='rounded-2xl banner-info p-5 lg:col-span-2'>
                  <p className='text-sm font-semibold text-accent-strong'>
                    The search bar also has shortcuts.
                  </p>
                  <p className='mt-2 text-sm leading-relaxed text-accent-strong'>
                    Use{' '}
                    <code className='rounded bg-white/55 px-1.5 py-0.5 text-[12px] font-mono text-accent-strong'>
                      @name
                    </code>
                    ,{' '}
                    <code className='rounded bg-white/55 px-1.5 py-0.5 text-[12px] font-mono text-accent-strong'>
                      #abbrev
                    </code>
                    , or{' '}
                    <code className='rounded bg-white/55 px-1.5 py-0.5 text-[12px] font-mono text-accent-strong'>
                      ~name
                    </code>{' '}
                    to add author, journal, or institution chips inline. See{' '}
                    <Link
                      href='#syntax'
                      className='underline underline-offset-2 hover:text-stone-900'
                    >
                      Search syntax
                    </Link>{' '}
                    for the full reference — including how to type{' '}
                    <code className='rounded bg-white/55 px-1.5 py-0.5 text-[12px] font-mono text-accent-strong'>
                      ~
                    </code>{' '}
                    on AZERTY keyboards and OpenAlex&apos;s keyword operators.
                  </p>
                </div>
              </div>
          </DocSection>

          {/* Search syntax — promoted to a dedicated section so the
              reference is discoverable from the help table of
              contents. Mirrors the SearchSyntaxHelp popover's
              content (shortcuts + OpenAlex operators + journal
              abbreviations + ~ typing tip) so users have a single
              canonical place to look. The popover itself is no
              longer mounted in the navbar; this section is the
              source of truth. */}
          <DocSection
            id='syntax'
            icon={AtSign}
            eyebrow='Query bar'
            title='Search syntax'
            intro={
              <p>
                The search bar accepts plain keywords plus three
                shortcut prefixes for filtering inline by author,
                journal, or institution. Whatever isn&apos;t a chip
                is sent to OpenAlex&apos;s keyword endpoint, so its
                full operator grammar — Boolean, exact phrases,
                wildcards, proximity, fuzzy — works too.
              </p>
            }
          >
            {/* Three-shortcut grid. Cards are uniform so the eye
                reads them as variations of one concept (prefix → chip)
                rather than three separate features. */}
            <div className='grid gap-4 lg:grid-cols-3'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  <code className='rounded surface-muted px-1.5 py-0.5 text-[13px] font-mono text-accent-strong'>
                    @name
                  </code>{' '}
                  Author
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Suggestions appear as you type; arrow keys + Enter
                  pick one. The selection becomes a green chip in the
                  bar. Click the chip&apos;s{' '}
                  <code className='rounded surface-muted px-1 text-xs font-mono text-stone-700'>
                    ✕
                  </code>{' '}
                  (or press{' '}
                  <Kbd>Backspace</Kbd> at an empty input) to remove
                  it.
                </p>
                <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`@acemoglu institutions
@kahneman @tversky prospect`}
                </pre>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  <code className='rounded surface-muted px-1.5 py-0.5 text-[13px] font-mono text-accent-strong'>
                    #abbrev
                  </code>{' '}
                  Journal
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Resolves a journal abbreviation against a built-in
                  catalog ({JOURNAL_SHORTCUTS_LIST.length} entries,
                  see below). The pick becomes a purple chip.
                </p>
                <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`#aer minimum wage
#qje #jpe inequality`}
                </pre>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  <code className='rounded surface-muted px-1.5 py-0.5 text-[13px] font-mono text-accent-strong'>
                    ~name
                  </code>{' '}
                  Institution
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Searches institutions against OpenAlex. The pick
                  becomes an amber chip. See the typing tip below for
                  the{' '}
                  <code className='rounded surface-muted px-1 text-xs font-mono text-stone-700'>
                    ~
                  </code>{' '}
                  key.
                </p>
                <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`~stanford econ
~MIT inequality`}
                </pre>
              </article>
            </div>

            {/* Cross-shortcut notes (kept compact). */}
            <div className='rounded-2xl border border-dashed border-app-strong bg-[rgba(255,253,248,0.74)] p-4'>
              <p className='text-sm leading-relaxed text-stone-600'>
                Multiple chips of the same kind are intersected (AND).
                Whatever isn&apos;t a chip is searched as keywords.
                Chips persist across queries until you remove them
                — they only commit on Enter / Search, same as the
                rest of the bar.
              </p>
            </div>

            {/* Typing-the-tilde — its own card so the per-layout
                instructions have room to breathe. */}
            <article className='surface-panel rounded-2xl border border-app p-5'>
              <h3 className='text-base font-semibold text-stone-900'>
                Typing{' '}
                <code className='rounded surface-muted px-1.5 py-0.5 text-[13px] font-mono text-accent-strong'>
                  ~
                </code>{' '}
                on common keyboards
              </h3>
              <ul className='mt-3 space-y-2 text-sm leading-relaxed text-stone-700'>
                <li>
                  <strong className='text-stone-900'>
                    US / UK QWERTY:
                  </strong>{' '}
                  top-left key — <Kbd>Shift</Kbd> + <Kbd>`</Kbd>.
                </li>
                <li>
                  <strong className='text-stone-900'>
                    Mac French AZERTY:
                  </strong>{' '}
                  <Kbd>Option</Kbd> + <Kbd>N</Kbd>, then <Kbd>Space</Kbd>.
                </li>
                <li>
                  <strong className='text-stone-900'>
                    Windows / Linux French AZERTY:
                  </strong>{' '}
                  <Kbd>AltGr</Kbd> + <Kbd>é</Kbd> (the <Kbd>2</Kbd>{' '}
                  key), then <Kbd>Space</Kbd>.
                </li>
                <li>
                  <strong className='text-stone-900'>
                    Or copy from here:
                  </strong>{' '}
                  <code className='select-all rounded surface-muted px-1.5 py-0.5 text-[13px] font-mono text-accent-strong'>
                    ~
                  </code>
                </li>
              </ul>
            </article>

            {/* OpenAlex keyword operators. Each card mirrors a
                section from the SearchSyntaxHelp popover so the
                content is feature-complete on the help page. */}
            <div>
              <h3 className='mb-3 text-sm font-semibold uppercase tracking-wider text-stone-500'>
                OpenAlex keyword operators
              </h3>
              <div className='grid gap-4 lg:grid-cols-2'>
                <article className='surface-panel rounded-2xl border border-app p-5'>
                  <h4 className='text-base font-semibold text-stone-900'>
                    Boolean
                  </h4>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Combine terms with <Kbd>AND</Kbd>, <Kbd>OR</Kbd>,{' '}
                    <Kbd>NOT</Kbd> (uppercase). Plain words are
                    joined by <Kbd>AND</Kbd>.
                  </p>
                  <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`(firm AND "horizontal merger") NOT (chicken OR vertical)`}
                  </pre>
                </article>

                <article className='surface-panel rounded-2xl border border-app p-5'>
                  <h4 className='text-base font-semibold text-stone-900'>
                    Exact phrase
                  </h4>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Quote a phrase to match it exactly.
                  </p>
                  <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`"horizontal merger"`}
                  </pre>
                </article>

                <article className='surface-panel rounded-2xl border border-app p-5'>
                  <h4 className='text-base font-semibold text-stone-900'>
                    Wildcards
                  </h4>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    <Kbd>*</Kbd> matches any characters, <Kbd>?</Kbd>{' '}
                    matches one. Need ≥3 chars before the wildcard;
                    leading wildcards aren&apos;t supported.
                  </p>
                  <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`machin*     wom?n`}
                  </pre>
                </article>

                <article className='surface-panel rounded-2xl border border-app p-5'>
                  <h4 className='text-base font-semibold text-stone-900'>
                    Proximity
                  </h4>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Append <Kbd>~N</Kbd> to a quoted phrase to find
                    the words within N positions of each other.
                  </p>
                  <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`"climate change"~5`}
                  </pre>
                </article>

                <article className='surface-panel rounded-2xl border border-app p-5 lg:col-span-2'>
                  <h4 className='text-base font-semibold text-stone-900'>
                    Fuzzy
                  </h4>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    Append <Kbd>~N</Kbd> (N = 0, 1, 2) to a single
                    term to tolerate typos. Needs ≥3 chars before the{' '}
                    <Kbd>~</Kbd>.
                  </p>
                  <pre className='mt-3 overflow-x-auto rounded surface-muted px-2 py-1.5 text-[12px] font-mono text-stone-700'>
{`machin~1`}
                  </pre>
                </article>
              </div>
            </div>

            {/* Journal abbreviation catalog — a long flat list, so
                it's hidden inside a native <details> by default.
                Sourced from data/journalAbbreviations.ts; matches the
                catalog the search bar's # autocomplete uses. */}
            <article className='surface-panel rounded-2xl border border-app p-5'>
              <h3 className='text-base font-semibold text-stone-900'>
                Available journal abbreviations
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                The same catalog the{' '}
                <code className='rounded surface-muted px-1 text-xs font-mono text-stone-700'>
                  #abbrev
                </code>{' '}
                autocomplete uses ({JOURNAL_SHORTCUTS_LIST.length}{' '}
                journals). Expand to scan; copy an abbreviation
                directly into the search bar.
              </p>
              <details className='mt-3 text-sm'>
                <summary className='cursor-pointer select-none text-stone-600 hover:text-stone-900'>
                  Show all {JOURNAL_SHORTCUTS_LIST.length} abbreviations
                </summary>
                <div className='mt-3 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3'>
                  {JOURNAL_SHORTCUTS_LIST.map((j) => (
                    <div
                      key={j.abbrev}
                      className='flex items-baseline gap-2 text-[12px]'
                    >
                      <code className='select-all rounded surface-muted px-1 font-mono text-accent-strong'>
                        #{j.abbrev}
                      </code>
                      <span className='truncate text-stone-600'>
                        {j.name}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            </article>

            {/* Closing note + link to OpenAlex docs. */}
            <p className='text-xs leading-relaxed text-stone-500'>
              Results sort by{' '}
              <code className='rounded surface-muted px-1 font-mono text-stone-700'>
                relevance_score
              </code>{' '}
              by default — a blend of text similarity and citation
              count. The full OpenAlex grammar is documented at{' '}
              <a
                href='https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/search-entities'
                target='_blank'
                rel='noopener noreferrer'
                className='underline underline-offset-2 hover:text-stone-900'
              >
                docs.openalex.org
              </a>
              .
            </p>
          </DocSection>

          <DocSection
            id='saved'
            icon={Bookmark}
            eyebrow='Reusable presets'
            title='Saved searches & journal filters'
            intro={
              <p>
                Paperazzi keeps two small save systems, each capped at 3
                presets. They look similar in the UI, but they are meant for
                different kinds of repetition.
              </p>
            }
            art={<SavedArtwork />}
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Saved searches
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  These snapshot the entire filter state, including the current
                  query, authors, and dates. They are useful for “the search I
                  run every Monday” workflows.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Saved journal filters
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  These snapshot only the Journals subsection: mode plus
                  selections. They are useful for switching quickly between
                  something like “Top 5” and a custom whitelist of niche
                  journals.
                </p>
              </article>
            </div>

            <div className='rounded-2xl border border-dashed border-app-strong bg-[rgba(255,253,248,0.74)] p-4'>
              <p className='text-sm leading-relaxed text-stone-600'>
                Both live in your browser&apos;s localStorage. You can inspect
                or erase them via the database icon in the navbar.
              </p>
            </div>
          </DocSection>

          <DocSection
            id='rankings'
            icon={ListOrdered}
            eyebrow='Journal schemes'
            title='Rankings & journal classifications'
            intro={
              <p>
                The Wide journal filter and the manual journal picker both read
                from the active <strong>ranking scheme</strong>: the catalogue
                that says which journals exist, what tier each is in, and which
                domain it belongs to. Out of the box Paperazzi ships with CNRS
                Économie, but you can fork it, replace it, or restore it at any
                time on the{' '}
                <Link
                  href='/rankings'
                  className='underline underline-offset-2 hover:text-stone-900'
                >
                  /rankings
                </Link>{' '}
                page.
              </p>
            }
            art={<RankingsArtwork />}
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Editing the built-in ranking
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  The baseline CNRS scheme is read-only. Click{' '}
                  <strong>Fork to edit</strong> to create a personal copy in
                  your browser. That copy becomes the active scheme, and from
                  there you can rename tiers, add or rename domains, and edit
                  per-journal tier or domain assignments.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Renaming a tier or domain cascades to every journal that uses
                  it. Deleting a non-empty tier or domain prompts a confirmation
                  and removes the journals attached to it.
                  <strong> Reset to default</strong> discards your copy and
                  restores the built-in baseline.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <Upload size={16} className='text-stone-500' />
                  Importing your own ranking
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Drag a ranking JSON file onto the dropzone at the top of the
                  page. The importer validates the file, shows a confirmation
                  modal with a summary, and on accept replaces the active
                  scheme.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Every ranking is <strong>self-contained</strong>: the JSON
                  declares its own tiers, domains, and journals. There is no
                  cross-ranking inheritance, and a small file-size cap helps
                  catch pasted accidents.
                </p>
              </article>
            </div>

            <details
              open
              className='group surface-panel rounded-2xl border border-app p-5'
            >
              <summary className='flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden'>
                <div>
                  <h3 className='text-base font-semibold text-stone-900'>
                    JSON shape
                  </h3>
                  <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                    A ranking scheme is a plain JSON object with the fields
                    below. Required fields are marked <strong>·</strong>.
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className='mt-1 shrink-0 text-stone-400 transition-transform group-open:rotate-180'
                />
              </summary>

              <div className='mt-4 overflow-hidden rounded-2xl border border-app bg-[#f7f1e5]'>
                <div className='border-b border-app px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400'>
                  ranking.json
                </div>
                <pre className='overflow-x-auto px-4 py-4 text-[11px] leading-relaxed text-stone-700'>
{`{
  "version": 1,                       · schema version, always 1 for now
  "id": "hceres-2021",                · stable id (free-form string)
  "name": "HCERES 2021",              · display name shown in the navbar/editor
  "description": "Optional notes",
  "tiers": [                          · list of tier definitions
    { "key": "A",  "label": "Cat A" },
    { "key": "B",  "label": "Cat B" },
    { "key": "C",  "label": "Cat C" }
  ],
  "domains": [                        · list of subject-area definitions
    { "key": "GEN",    "label": "General" },
    { "key": "Macro",  "label": "Macroeconomics" }
  ],
  "journals": [                       · the entries themselves
    {
      "issn":   "0002-8282",          · used everywhere as primary key
      "name":   "American Economic Review",
      "tier":   "A",                  · must match one of tiers[].key
      "domain": "GEN"                 · must match one of domains[].key
    }
  ],
  "presets": [                        · optional shortcut buttons (Top 5, …)
    { "id": "all",    "name": "All" },
    { "id": "a-only", "name": "A only", "tiers": ["A"] },
    {
      "id": "top5",
      "name": "Top 5",
      "issns": ["0002-8282", "0012-9682", "..."]
    }
  ]
}`}
                </pre>
              </div>

              <ul className='mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600'>
                <li>
                  <strong>Tier keys</strong> are arbitrary strings: “1 / 2” for
                  CNRS, “A / B / C” for HCERES or CNU, “Q1 / Q2 / Q3” for JCR,
                  and so on.
                </li>
                <li>
                  <strong>Labels are optional</strong> on tiers and domains; the
                  editor falls back to the key when no label is given.
                </li>
                <li>
                  Every journal&apos;s <code>tier</code> and <code>domain</code>{' '}
                  must reference a declared key. The importer accepts unknown
                  keys, but the UI will surface them as <em>(unknown)</em> until
                  you fix the scheme.
                </li>
                <li>
                  <strong>Presets</strong> are optional shortcut buttons that
                  appear in the Wide filter. Each is either a tier/domain combo
                  or an explicit ISSN whitelist.
                </li>
              </ul>
            </details>

            <div className='grid gap-4 lg:grid-cols-[0.84fr_1.16fr]'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <Download size={16} className='text-stone-500' />
                  Exporting
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Click <strong>Export</strong> on the rankings header to
                  download the active scheme as JSON. It works well as a backup,
                  a template, or a shareable starting point.
                </p>
              </article>

              <div className='rounded-2xl banner-warning p-5'>
                <p className='text-sm leading-relaxed text-warning'>
                  Ranking data lives in localStorage, not on a server. Switching
                  browsers or devices means starting from the built-in CNRS
                  baseline unless you export your customized scheme and import
                  it elsewhere.
                </p>
              </div>
            </div>
          </DocSection>

          <DocSection
            id='network'
            icon={Network}
            eyebrow='Citation map'
            title='The network view'
            intro={
              <p>
                Click <em>see network</em> on any paper card to enter a view
                where references, citing papers, and citation chains are all
                visible at once. It is one of the main reasons the app feels
                exploratory instead of list-bound.
              </p>
            }
            art={<NetworkArtwork />}
          >
            <div className='grid gap-4 md:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  What you see
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  The focal paper sits at its publication-year and
                  citation-count coordinate. References and citing papers
                  surround it, with edges drawn whenever one visible paper cites
                  another.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Filters still apply
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  If you have <em>Top 5</em> active in Journals, only refs and
                  cites in those journals appear. Switching Journals to{' '}
                  <em>Off</em> reveals the full neighborhood again. A chip in
                  the header tells you which filter is active.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Hover and click
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Hover a node for its title and a transient edge highlight.
                  Click a node to <em>pin its links</em>; the highlight stays
                  after the cursor leaves. Click more nodes to reveal citation
                  paths between them.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Pan, zoom, reset
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Drag the background to pan. Zoom with scroll, the plus and
                  minus buttons, or a trackpad pinch. Visual sizes stay constant
                  while positions move, and the Reset chip restores the default
                  framing.
                </p>
              </article>
            </div>

            <article className='surface-panel rounded-2xl border border-app p-5'>
              <h3 className='text-base font-semibold text-stone-900'>
                Tooltip behavior and limits
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                The tooltip stays open if you move into it, so you can pin a
                paper to the sidebar or open it in DOI, OpenAlex, Scholar, or
                PDF without losing the highlight. Networks are capped at 200
                references and 200 citing papers per direction, and for very
                popular papers the displayed slice reflects the current Sort.
              </p>
            </article>
          </DocSection>

          <DocSection
            id='pinned'
            icon={Pin}
            eyebrow='Working library'
            title='Pinned papers, collections, notes, and keywords'
            intro={
              <p>
                Once a paper looks promising, the pinboard becomes your project
                workspace. It is deliberately compact: less a database of
                everything, more a working library you can actually curate.
              </p>
            }
            art={<LibraryArtwork />}
          >
            <div className='grid gap-4 md:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Pinned papers and groups
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Click the pin icon on any paper card to add it to your
                  pinboard. The cap is 30 pinned papers per collection. Inside
                  the sidebar, create groups to organize pins by topic; each
                  group gets a stable color so you can scan them quickly.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Drag papers between groups or onto the ungrouped section. Use
                  <strong> Select mode</strong> for bulk actions like delete or
                  move.
                </p>
              </article>

              <article
                id='collections'
                className='scroll-mt-24 surface-panel rounded-2xl border border-app p-5'
              >
                <h3 className='text-base font-semibold text-stone-900'>
                  Collections
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  A <strong>collection</strong> is a self-contained library of
                  pinned papers and groups: one workspace per project, reading
                  list, or literature review. The collection switcher sits at
                  the top of the pin sidebar and the cap is 20 collections.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  You can move papers between collections by dragging a pin over
                  the switcher pill until the menu opens, then dropping it onto
                  a target collection.
                </p>
                <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                  Deleting a collection asks for confirmation and tells you how
                  many pins will be lost. If you delete the active one, the app
                  auto-replaces it.
                </p>
              </article>

              <article
                id='notes'
                className='scroll-mt-24 surface-panel rounded-2xl border border-app p-5'
              >
                <div className='flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <StickyNote size={16} className='text-stone-500' />
                  Notes on pinned papers
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Open a pinned paper&apos;s detail modal and look below the
                  abstract for a short personal note field, capped at 500
                  characters. It is meant for why the paper matters, what to
                  revisit, or the key takeaway you do not want to forget.
                </p>
                <ul className='mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600'>
                  <li>
                    Add a note via the <em>Add</em> button or the dashed
                    placeholder.
                  </li>
                  <li>
                    Save with <em>Save</em> or <Kbd>Cmd/Ctrl + Enter</Kbd>;
                    cancel with <Kbd>Esc</Kbd>.
                  </li>
                  <li>
                    Remove a note with <em>Remove</em>; the paper stays pinned.
                  </li>
                </ul>
                <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                  Notes are scoped to the collection where the paper is pinned,
                  so the same paper can carry different notes in different
                  projects.
                </p>
              </article>

              <article
                id='keywords'
                className='scroll-mt-24 surface-panel rounded-2xl border border-app p-5'
              >
                <div className='flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <Tag size={16} className='text-stone-500' />
                  Keywords
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Below the Note section, the keyword editor lets you tag a
                  pinned paper with up to 6 short labels. Tags appear on the
                  pinned card so you can scan themes like <em>theory</em>,{' '}
                  <em>identification</em>, or <em>RCT</em> without opening each
                  paper.
                </p>
                <ul className='mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600'>
                  <li>
                    Type a keyword and press <Kbd>Enter</Kbd> or <Kbd>,</Kbd> to
                    commit. Click × on a chip to remove it.
                  </li>
                  <li>
                    Press <Kbd>Backspace</Kbd> in the empty input to pop the
                    last keyword.
                  </li>
                  <li>
                    Duplicates are blocked automatically, and the input hides at
                    the 6-tag limit until you remove one.
                  </li>
                </ul>
              </article>
            </div>
          </DocSection>

          <DocSection
            id='share'
            icon={Download}
            eyebrow='Portability'
            title='Sharing & backing up: import / export'
            intro={
              <p>
                Paperazzi exports are simple JSON files. That keeps them easy to
                inspect, version, share, and re-import without special tooling.
              </p>
            }
            art={<ShareArtwork />}
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <Download size={16} className='text-stone-500' />
                  Export
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  In the pin sidebar header, the <strong>Export</strong> button
                  opens a menu with two options.
                </p>
                <ul className='mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600'>
                  <li>
                    <strong>This collection</strong> downloads a{' '}
                    <code>.paperazzi-collection.json</code> file containing one
                    collection and its papers, groups, notes, and keywords.
                  </li>
                  <li>
                    <strong>All collections</strong> downloads a date-stamped{' '}
                    <code>.paperazzi-library.json</code> file as a full-device
                    backup.
                  </li>
                </ul>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                  <Upload size={16} className='text-stone-500' />
                  Import
                </div>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Drag and drop any Paperazzi export onto the page. A
                  single-collection file becomes a new collection in your
                  workspace. A library file restores every collection it
                  contains in one go.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Imports never overwrite existing collections. They only add
                  new ones and switch you to the first imported collection so
                  you can inspect the result immediately.
                </p>
              </article>
            </div>

            <article className='surface-panel rounded-2xl border border-app p-5'>
              <h3 className='text-base font-semibold text-stone-900'>
                What&apos;s in the file
              </h3>
              <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                Both formats are plain JSON, version-tagged, and contain paper
                IDs, titles, authors, your groups, and your per-paper notes and
                keywords. They do <em>not</em> contain abstracts, citation
                counts, or other freshly fetched OpenAlex metadata. Those are
                pulled live when the import lands so the recipient sees
                up-to-date numbers.
              </p>
            </article>
          </DocSection>

          <DocSection
            id='contribute'
            icon={Flag}
            eyebrow='Contribute back'
            title='Help improve the data (OpenAlex)'
            intro={
              <p>
                Paperazzi runs on OpenAlex, an open, non-profit catalog of
                scholarly works. Reporting rough edges takes seconds and helps
                every researcher who depends on the same data layer.
              </p>
            }
            art={<ContributeArtwork />}
          >
            <article className='surface-panel rounded-2xl border border-app p-5'>
              <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                <Flag size={16} className='text-stone-500' />
                How to report a paper error
              </div>
              <ol className='mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-700'>
                <li>
                  On any paper card, click the small <strong>flag icon</strong>{' '}
                  in the bottom-right corner. A short panel opens with the
                  paper&apos;s OpenAlex ID and a copy button.
                </li>
                <li>
                  Click <strong>Submit correction</strong>. A short Google Form
                  opens in a new tab. Paste the ID, describe what is wrong, and
                  submit.
                </li>
                <li>
                  Optional: click <strong>Mark as reported</strong> so you do
                  not flag the same paper twice later.
                </li>
              </ol>

              <div className='mt-4 flex flex-wrap gap-3 text-sm'>
                <a
                  href={PAPER_CORRECTION_FORM_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-2 rounded-full border border-app bg-[var(--background-card)] px-4 py-2 text-stone-700 transition hover:text-stone-900'
                >
                  <Flag size={14} />
                  Paper correction form
                  <ArrowUpRight size={14} />
                </a>
                <a
                  href={AUTHOR_CORRECTION_FORM_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='inline-flex items-center gap-2 rounded-full border border-app bg-[var(--background-card)] px-4 py-2 text-stone-700 transition hover:text-stone-900'
                >
                  <Flag size={14} />
                  Author correction form
                  <ArrowUpRight size={14} />
                </a>
              </div>
            </article>

            <div className='grid gap-4 lg:grid-cols-[1fr_0.95fr]'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  What&apos;s worth reporting
                </h3>
                <ul className='mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-600'>
                  <li>
                    Wrong or duplicate <strong>authors</strong>, missing
                    affiliations, broken ORCID links.
                  </li>
                  <li>
                    Garbled or truncated <strong>titles</strong>.
                  </li>
                  <li>
                    Missing or incorrect <strong>journal</strong>, year, ISSN,
                    or DOI.
                  </li>
                  <li>
                    Missing <strong>abstract</strong> or PDF link when one
                    exists publicly.
                  </li>
                  <li>
                    Off <strong>citation counts</strong> or a wrong reference
                    list.
                  </li>
                  <li>A whole paper missing from OpenAlex.</li>
                </ul>
              </article>

              <div className='rounded-2xl banner-info p-5'>
                <p className='text-sm leading-relaxed text-accent-strong'>
                  For background and OpenAlex&apos;s preferred workflow, see{' '}
                  <a
                    href={OPENALEX_FIX_ERRORS_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='underline underline-offset-2'
                  >
                    their docs
                  </a>
                  . Contributing here helps strengthen open scholarly
                  infrastructure rather than closed-source silos.
                </p>
              </div>
            </div>
          </DocSection>

          <DocSection
            id='mcp'
            icon={Plug}
            eyebrow='Connect an LLM'
            title='Use Paperazzi from Claude, ChatGPT, and other MCP clients'
            intro={
              <p>
                Paperazzi exposes its economics-aware search as an{' '}
                <a
                  href='https://modelcontextprotocol.io'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='underline underline-offset-2'
                >
                  MCP
                </a>{' '}
                (Model Context Protocol) server, so any MCP-capable assistant
                can run the same search you use here. The model gets a single
                tool, <code className='rounded surface-muted px-1 text-xs font-mono text-stone-700'>paperazzi_search</code>,
                with arguments for query, CNRS tiers and domains, top-5
                shortcut, year range, sort, and limit.
              </p>
            }
            art={<McpArtwork />}
          >
            <article className='surface-panel rounded-2xl border border-app p-5'>
              <div className='inline-flex items-center gap-2 text-base font-semibold text-stone-900'>
                <Terminal size={16} className='text-stone-500' />
                The endpoint
              </div>
              <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                One URL, Streamable HTTP transport. Same auth model as the
                public site (no key required), same OpenAlex backend, same
                ranking schemes.
              </p>
              <pre className='mt-3 overflow-x-auto rounded surface-muted px-3 py-2 text-[12px] font-mono text-stone-700'>
                {`https://paperazzi.vercel.app/api/mcp`}
              </pre>
              <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                If you self-host, replace the host with your own deployment.
                The route handles POST (tool calls), GET (response stream), and
                DELETE (session teardown) on the same path.
              </p>
            </article>

            {/* Per-client setup — collapsed by default so the section
                stays compact. Each client lives in its own native
                <details> so users only expand the one they need; the
                chevron rotates 180° on open via group-open utilities.
                Claude is open by default (most-likely audience) — drop
                the `open` attribute below if you'd prefer everything
                collapsed on first load. */}
            <div className='space-y-2'>
              <p className='text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500'>
                Pick your client
              </p>

              <details
                className='group surface-panel rounded-2xl border border-app p-5'
              >
                <summary className='flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    Claude Desktop &amp; Claude.ai
                  </h3>
                  <ChevronDown
                    size={18}
                    className='shrink-0 text-stone-400 transition-transform group-open:rotate-180'
                  />
                </summary>
                <ol className='mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-700'>
                  <li>
                    Open <strong>Settings → Connectors</strong> (Claude
                    Desktop) or <strong>Settings → Connectors</strong> on
                    claude.ai.
                  </li>
                  <li>
                    Click <strong>Add custom connector</strong>.
                  </li>
                  <li>
                    Name it <em>Paperazzi</em> and paste the endpoint URL
                    above as the server URL. Leave authentication empty.
                  </li>
                  <li>
                    Save. The{' '}
                    <code className='rounded surface-muted px-1 text-xs font-mono text-stone-700'>
                      paperazzi_search
                    </code>{' '}
                    tool will appear in new chats — enable it from the tool
                    picker before asking a research question.
                  </li>
                </ol>
                <div className='mt-4 rounded-2xl banner-info p-4 text-[13px] leading-relaxed text-accent-strong'>
                  Older versions of Claude Desktop only support local{' '}
                  <code className='rounded bg-white/55 px-1.5 py-0.5 text-[12px] font-mono text-accent-strong'>
                    stdio
                  </code>{' '}
                  MCP servers via the desktop config file. Update to the
                  latest build to use the remote-connector flow above.
                </div>
              </details>

              <details className='group surface-panel rounded-2xl border border-app p-5'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    ChatGPT
                  </h3>
                  <ChevronDown
                    size={18}
                    className='shrink-0 text-stone-400 transition-transform group-open:rotate-180'
                  />
                </summary>
                <ol className='mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-stone-700'>
                  <li>
                    Go to <strong>Settings → Connectors</strong> in ChatGPT
                    (available on plans that include custom connectors).
                  </li>
                  <li>
                    Choose <strong>Add a custom MCP server</strong>.
                  </li>
                  <li>
                    Paste the Paperazzi endpoint URL, leave the auth blank,
                    and save.
                  </li>
                  <li>
                    In a new chat, open the tools menu and enable Paperazzi.
                    Connector availability varies by plan and region — if the
                    option is missing, check OpenAI&apos;s docs for the
                    current rollout.
                  </li>
                </ol>
              </details>

              <details className='group surface-panel rounded-2xl border border-app p-5'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    Cursor
                  </h3>
                  <ChevronDown
                    size={18}
                    className='shrink-0 text-stone-400 transition-transform group-open:rotate-180'
                  />
                </summary>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Cursor supports remote MCP servers out of the box. Open{' '}
                  <strong>Settings → MCP</strong>, click <strong>Add</strong>,
                  pick the <em>HTTP / SSE</em> transport, and paste the
                  endpoint URL. The tool becomes available in agent chats
                  once the connection turns green.
                </p>
                <pre className='mt-3 overflow-x-auto rounded surface-muted px-3 py-2 text-[12px] font-mono text-stone-700'>
                  {`{
  "mcpServers": {
    "paperazzi": {
      "url": "https://paperazzi.vercel.app/api/mcp"
    }
  }
}`}
                </pre>
                <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                  The JSON form above is what Cursor (and most config-driven
                  clients like Claude Code, Windsurf, Continue, and Zed)
                  write to their MCP config. The shape is identical across
                  clients — only the file location changes.
                </p>
              </details>

              <details className='group surface-panel rounded-2xl border border-app p-5'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden'>
                  <h3 className='text-base font-semibold text-stone-900'>
                    Mistral Le Chat, Cline &amp; other MCP clients
                  </h3>
                  <ChevronDown
                    size={18}
                    className='shrink-0 text-stone-400 transition-transform group-open:rotate-180'
                  />
                </summary>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Any client that speaks MCP over Streamable HTTP can use
                  the same endpoint. Look for <em>Custom connectors</em>,{' '}
                  <em>Add MCP server</em>, or an equivalent setting, pick
                  the HTTP transport, and paste the URL. No API key is
                  needed.
                </p>
              </details>
            </div>

            <article className='surface-panel rounded-2xl border border-app p-5'>
              <h3 className='text-base font-semibold text-stone-900'>
                What the model can ask for
              </h3>
              <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                The tool description teaches the model when to reach for it,
                so a natural-language prompt is usually enough. A few examples:
              </p>
              <ul className='mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-stone-700'>
                <li>
                  <em>
                    Find the most-cited Top 5 papers on minimum wage
                    employment effects published since 2015.
                  </em>
                </li>
                <li>
                  <em>
                    Show recent macro papers in tier-1 journals about
                    monetary-policy transmission.
                  </em>
                </li>
                <li>
                  <em>
                    Search Econometrica and the QJE for work on instrumental
                    variables with weak instruments.
                  </em>
                </li>
              </ul>
              <p className='mt-3 text-xs leading-relaxed text-stone-500'>
                Each tool response includes a link back to the same search in
                the Paperazzi UI, so you can open the citation graph, pin
                papers, and keep working from the model&apos;s starting point.
              </p>
            </article>
          </DocSection>

          <DocSection
            id='data'
            icon={Database}
            eyebrow='Local data'
            title='Inspecting & erasing your data'
            intro={
              <p>
                Everything Paperazzi stores lives in your browser&apos;s
                localStorage. That is good for privacy and portability, but it
                also means backups are your responsibility.
              </p>
            }
            art={<StorageArtwork />}
          >
            <div className='grid gap-4 lg:grid-cols-[1.1fr_0.9fr]'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <p className='text-sm leading-relaxed text-stone-700'>
                  The <strong>database icon in the navbar</strong> opens a panel
                  listing saved searches, saved journal filters, pinned papers,
                  groups, reported flags, and UI preferences.
                </p>
                <p className='mt-3 text-sm leading-relaxed text-stone-700'>
                  Erase individual items via the panel that owns them, or wipe
                  everything with the red button in the database panel. The page
                  reloads afterward so in-memory state matches what is on disk.
                </p>
              </article>

              <div className='rounded-2xl banner-warning p-5'>
                <p className='text-sm leading-relaxed text-warning'>
                  If you care about your pin libraries or custom rankings,
                  export them before clearing storage or changing browsers.
                </p>
              </div>
            </div>
          </DocSection>

          <DocSection
            id='tips'
            icon={Lightbulb}
            eyebrow='Good habits'
            title='Workflow examples & tips'
            intro={
              <p>
                Once the controls are familiar, the app works best when you
                treat it as a narrow research instrument rather than a general
                discovery feed.
              </p>
            }
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Mapping a paper&apos;s research path
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Start from a paper you already trust. Click{' '}
                  <em>see network</em>. Set Journals to <em>Wide → 1</em> if you
                  want the canonical outlets, then click the focal paper and
                  follow references or cites into a path. Pin anything worth
                  keeping so the network becomes a curated reading list.
                </p>
              </article>

              <article className='surface-panel rounded-2xl border border-app p-5'>
                <h3 className='text-base font-semibold text-stone-900'>
                  Monitoring a journal or a small set of journals
                </h3>
                <p className='mt-2 text-sm leading-relaxed text-stone-700'>
                  Switch Journals to <em>Specific</em>, pick the outlet(s), sort
                  by <em>Most Recent</em>, and bound the date range to the last
                  month. Save that journal filter for quick reruns. Add a query,
                  author, or institution if you want the monitoring view to be
                  more selective.
                </p>
              </article>
            </div>
          </DocSection>
        </div>

        <div className='mt-12 rounded-2xl border border-app surface-panel p-6 text-center shadow-[0_10px_24px_-22px_rgba(31,26,20,0.4)]'>
          <p className='text-sm leading-relaxed text-stone-600'>
            Stuck or curious about the bigger picture? See{' '}
            <Link
              href='/about'
              className='font-medium text-stone-800 underline underline-offset-2 transition hover:text-stone-900'
            >
              About Paperazzi
            </Link>{' '}
            for the philosophy behind the app and comparisons with other tools.
          </p>
        </div>
      </div>
    </main>
  );
}
