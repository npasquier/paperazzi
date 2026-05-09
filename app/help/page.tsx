import {
  Compass,
  Filter,
  Bookmark,
  Network,
  Pin,
  Database,
  Lightbulb,
  Library,
  StickyNote,
  Tag,
  Download,
  Upload,
  Flag,
} from 'lucide-react';
import {
  PAPER_CORRECTION_FORM_URL,
  AUTHOR_CORRECTION_FORM_URL,
  OPENALEX_FIX_ERRORS_URL,
} from '@/utils/correctionForms';

export default function HelpPage() {
  return (
    <main className='h-full overflow-y-auto bg-[var(--background)]'>
      <div className='max-w-3xl mx-auto px-6 py-16'>
        {/* Header */}
        <div className='mb-12'>
          <h1 className='text-2xl font-semibold text-stone-900 mb-3'>
            Using Paperazzi
          </h1>
          <p className='text-stone-600 leading-relaxed'>
            A walkthrough of every feature, in the order you&apos;ll likely need
            them. If something feels missing here, ping me — these docs grow
            with use.
          </p>
        </div>

        <div className='space-y-12'>
          {/* Quick start */}
          <section id='quick-start'>
            <div className='flex items-center gap-2 mb-4'>
              <Compass size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Quick start
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app'>
              <ol className='space-y-3 text-stone-700 leading-relaxed'>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    1
                  </span>
                  <span>
                    Type a query in the navbar (e.g. <em>endogenous growth</em>)
                    and hit Enter.
                  </span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    2
                  </span>
                  <span>
                    In the left filter panel, switch the Journals tab to{' '}
                    <strong>Wide</strong> and click <strong>Top 5</strong>.
                  </span>
                </li>
                <li className='flex items-start gap-3'>
                  <span className='flex-shrink-0 w-5 h-5 rounded-full surface-subtle text-app-muted text-xs flex items-center justify-center mt-0.5'>
                    3
                  </span>
                  <span>
                    Click <strong>see network</strong> on any paper card to
                    explore its citation neighborhood.
                  </span>
                </li>
              </ol>
              <p className='text-sm text-stone-500 mt-4'>
                Three clicks to a focused, high-quality view of the literature
                around a topic.
              </p>
            </div>
          </section>

          {/* Filter panel */}
          <section id='filters'>
            <div className='flex items-center gap-2 mb-4'>
              <Filter size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                The filter panel
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-5'>
              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  Journals
                </h3>
                <p className='text-sm text-stone-700 mb-2'>
                  The Journals section has three modes:
                </p>
                <ul className='space-y-2 text-sm text-stone-600 leading-relaxed'>
                  <li className='flex items-start gap-2'>
                    <span className='font-medium text-stone-900 mt-0.5'>
                      Wide
                    </span>
                    <span>
                      — preset pills (<em>All</em>, <em>Top 5</em>) and
                      pickable category & domain rows. Cycle through CNRS
                      categories (1–4) and economics subdomains (GEN, Macro,
                      Theory, etc.) to scope a search broadly.
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='font-medium text-stone-900 mt-0.5'>
                      Specific
                    </span>
                    <span>
                      — pick individual journals by name. Updates take effect
                      live, no need to re-run search.
                    </span>
                  </li>
                  <li className='flex items-start gap-2'>
                    <span className='font-medium text-stone-900 mt-0.5'>
                      Off
                    </span>
                    <span>
                      — disables journal filtering entirely. Your selections in
                      Wide and Specific are preserved, just inactive.
                    </span>
                  </li>
                </ul>
                <p className='text-xs text-stone-500 mt-3'>
                  Sessions start in <em>Off</em>. Switching to Wide picks up the
                  last selection you made there; same for Specific.
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  Authors and institutions
                </h3>
                <p className='text-sm text-stone-700'>
                  Both work like Specific journals: open the picker, search by
                  name, add as many as you want. Multiple authors filter to
                  papers where <em>any</em> of them is listed; same for
                  institutions.
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  Type, date, sort
                </h3>
                <p className='text-sm text-stone-700'>
                  Filter by publication type (Article, Review, Preprint, …),
                  bound by year range, and sort by Relevance, Most Recent, Most
                  Cited, or Oldest First. Sort affects which papers appear when
                  results exceed a page — and which 200 are pulled for the
                  network view, since networks are capped at 200 per direction.
                </p>
              </div>
            </div>
          </section>

          {/* Saved searches */}
          <section id='saved'>
            <div className='flex items-center gap-2 mb-4'>
              <Bookmark size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Saved searches & journal filters
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app'>
              <p className='text-sm text-stone-700 mb-3'>
                Two independent saved-state mechanisms, each capped at 3
                presets:
              </p>
              <ul className='space-y-2 text-sm text-stone-600 leading-relaxed'>
                <li>
                  <strong>Saved searches</strong> snapshot the entire filter
                  state including the current query, authors, and dates. Useful
                  for &quot;the search I run every Monday&quot; workflows.
                </li>
                <li>
                  <strong>Saved journal filters</strong> snapshot only the
                  Journals subsection (mode + selections). Useful for switching
                  quickly between &quot;Top 5&quot; and a custom whitelist
                  of niche journals.
                </li>
              </ul>
              <p className='text-xs text-stone-500 mt-3'>
                Both live in your browser&apos;s localStorage. Inspect or erase
                them via the database icon in the navbar.
              </p>
            </div>
          </section>

          {/* Network view */}
          <section id='network'>
            <div className='flex items-center gap-2 mb-4'>
              <Network size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                The network view
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-4'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Click <em>see network</em> on any paper card to enter the
                network view. The focal paper sits at its (publication year,
                citation count) coordinate; its references and citing papers
                surround it. Edges are drawn whenever one paper in view cites
                another.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                <strong>Filters apply.</strong> If you have <em>Top 5</em>{' '}
                active in the Journals panel, only refs and cites in those
                journals appear. Switching to <em>Off</em> reveals everything. A
                small chip in the network header tells you which filter is
                active.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                <strong>Hover</strong> a node for its title and a transient edge
                highlight. <strong>Click</strong> a node to{' '}
                <em>pin its links</em> — the highlight stays after the cursor
                leaves. Click more nodes to add to the path; edges between two
                pinned nodes turn amber, making citation chains visible. Use the{' '}
                <strong>Clear</strong> chip in the legend to reset.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                <strong>Pan</strong> by dragging the background.{' '}
                <strong>Zoom</strong> with scroll, the +/− buttons, or by
                pinching the trackpad. Visual sizes (dots, lines, labels) stay
                constant — only positions move. The Reset chip returns to the
                default view.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                The tooltip stays open if you move into it, so you can pin a
                paper to your sidebar or open it in DOI / OpenAlex without
                losing the highlight. The card surfaces Scholar and PDF links
                too.
              </p>
              <p className='text-xs text-stone-500'>
                Networks are capped at 200 references and 200 citing papers per
                direction (the OpenAlex per-page max). For very popular papers,
                the displayed set reflects the current Sort —{' '}
                <em>Most Cited</em> by default. Switch sort to see different
                slices.
              </p>
            </div>
          </section>

          {/* Pinned */}
          <section id='pinned'>
            <div className='flex items-center gap-2 mb-4'>
              <Pin size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Pinned papers & groups
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-4'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Click the pin icon on any paper card to add it to your pinboard
                (right sidebar). The cap is 30 pinned papers per collection.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Inside the sidebar, <strong>create groups</strong> to organize
                pins by topic. Each group gets a deterministic color (a tiny dot
                in the header and a colored left border on each member card) so
                you can scan which paper belongs to which theme. The color is
                derived from the group&apos;s id, so renaming or reordering
                keeps colors stable.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                <strong>Drag papers</strong> between groups, or onto the
                ungrouped section, to reorganize. Use{' '}
                <strong>Select mode</strong> to bulk-act on multiple papers
                (delete, move). Pinned cards stay intentionally tiny: a title,
                one compact metadata line with clickable <em>cites</em> and{' '}
                <em>refs</em> counts, and a subtle left color bar for group
                identity. Clicking a card opens its details, while the inline
                <em>network</em> shortcut still takes you straight to that
                paper&apos;s citation map.
              </p>
            </div>
          </section>

          {/* Collections */}
          <section id='collections'>
            <div className='flex items-center gap-2 mb-4'>
              <Library size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Collections
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-4'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                A <strong>collection</strong> is a self-contained library of
                pinned papers and groups — think of it as a separate workspace
                for each project (job-market paper, lit review, course reading
                list, …). Switching collections swaps every pin and group in
                the sidebar at once; the inactive ones stay safely on disk.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                The <strong>collection switcher pill</strong> sits at the top of
                the pin sidebar. Click it to see every collection you have, with
                rename / delete buttons that appear on hover for any row (active
                or not). Use <strong>New collection</strong> at the bottom of
                the menu to start a fresh workspace. The cap is 20 collections.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                <strong>Move papers between collections</strong> by drag and
                drop: start dragging a pinned paper, hover over the switcher
                pill until the menu opens, then drop the paper onto a target
                collection. The paper leaves the active workspace and reappears
                in the target — handy when a paper turns out to belong to a
                different project.
              </p>
              <p className='text-xs text-stone-500'>
                Deleting a collection asks for confirmation in an in-app modal
                (no native browser alert) and tells you how many pins are about
                to be lost. The active collection is auto-replaced if you delete
                the one you&apos;re currently viewing.
              </p>
            </div>
          </section>

          {/* Notes */}
          <section id='notes'>
            <div className='flex items-center gap-2 mb-4'>
              <StickyNote size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Notes on pinned papers
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-3'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Click any pinned paper card to open its detail modal. Below the
                abstract you&apos;ll find a <strong>Note</strong> section — a
                short personal annotation (up to 500 characters) for capturing
                why a paper matters, key takeaways, or what to revisit.
              </p>
              <ul className='list-disc pl-5 space-y-1 text-sm text-stone-600 leading-relaxed'>
                <li>
                  <strong>Add</strong> a note via the <em>Add</em> button or
                  by clicking the dashed placeholder.
                </li>
                <li>
                  <strong>Save</strong> with the <em>Save</em> button or with{' '}
                  <kbd className='px-1.5 py-0.5 surface-muted rounded text-[11px] font-mono'>
                    Cmd/Ctrl + Enter
                  </kbd>
                  ; <strong>cancel</strong> with{' '}
                  <kbd className='px-1.5 py-0.5 surface-muted rounded text-[11px] font-mono'>
                    Esc
                  </kbd>
                  .
                </li>
                <li>
                  <strong>Remove</strong> a note with the{' '}
                  <em>Remove</em> button — the paper itself stays pinned.
                </li>
              </ul>
              <p className='text-xs text-stone-500'>
                Notes are scoped to the collection where the paper is pinned,
                so the same paper in two collections can carry two different
                notes. A small <em>note</em> indicator appears on the pinned
                card so you can spot annotated papers at a glance — hover the
                card&apos;s metadata line to see the note text in a tooltip.
              </p>
            </div>
          </section>

          {/* Keywords */}
          <section id='keywords'>
            <div className='flex items-center gap-2 mb-4'>
              <Tag size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Keywords
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-3'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Below the Note section, the <strong>Keywords</strong> editor
                lets you tag a pinned paper with up to 6 short labels (24
                characters each). Tags appear as small chips on the pinned card
                in the sidebar, so you can scan tagged themes — e.g.{' '}
                <em>theory</em>, <em>identification</em>, <em>RCT</em> — without
                opening each paper.
              </p>
              <ul className='list-disc pl-5 space-y-1 text-sm text-stone-600 leading-relaxed'>
                <li>
                  Type a keyword and press{' '}
                  <kbd className='px-1.5 py-0.5 surface-muted rounded text-[11px] font-mono'>
                    Enter
                  </kbd>{' '}
                  or{' '}
                  <kbd className='px-1.5 py-0.5 surface-muted rounded text-[11px] font-mono'>
                    ,
                  </kbd>{' '}
                  to commit. Click the × on any chip to remove it.
                </li>
                <li>
                  Pressing{' '}
                  <kbd className='px-1.5 py-0.5 surface-muted rounded text-[11px] font-mono'>
                    Backspace
                  </kbd>{' '}
                  in the empty input pops the last keyword — common shortcut in
                  tag inputs, saves a click.
                </li>
                <li>
                  Duplicates are caught automatically (case-insensitive). When
                  you hit the 6-tag limit, the input hides until you remove one.
                </li>
              </ul>
              <p className='text-xs text-stone-500'>
                Keywords are user-authored and separate from any topic labels
                OpenAlex assigns to a paper. Like notes, they live with the pin
                in its collection and round-trip through export/import.
              </p>
            </div>
          </section>

          {/* Import / Export */}
          <section id='share'>
            <div className='flex items-center gap-2 mb-4'>
              <Download size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Sharing & backing up: import / export
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-5'>
              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2 inline-flex items-center gap-1.5'>
                  <Download size={14} className='text-stone-500' />
                  Export
                </h3>
                <p className='text-sm text-stone-700 leading-relaxed mb-2'>
                  In the pin sidebar header, the <strong>Export</strong> button
                  (next to <em>Clear all</em> and <em>New group</em>) opens a
                  small menu with two options:
                </p>
                <ul className='list-disc pl-5 space-y-1 text-sm text-stone-600 leading-relaxed'>
                  <li>
                    <strong>This collection</strong> — downloads a{' '}
                    <code className='px-1 surface-muted rounded text-[11px] font-mono'>
                      .paperazzi-collection.json
                    </code>{' '}
                    file containing one collection (papers, groups, notes,
                    keywords). Designed for sharing one workspace with a
                    collaborator.
                  </li>
                  <li>
                    <strong>All collections</strong> — downloads a date-stamped{' '}
                    <code className='px-1 surface-muted rounded text-[11px] font-mono'>
                      .paperazzi-library.json
                    </code>{' '}
                    file containing every collection on this device. Designed
                    as a personal backup so you can move between browsers /
                    machines without losing your libraries.
                  </li>
                </ul>
              </div>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2 inline-flex items-center gap-1.5'>
                  <Upload size={14} className='text-stone-500' />
                  Import
                </h3>
                <p className='text-sm text-stone-700 leading-relaxed mb-2'>
                  <strong>Drag and drop</strong> any Paperazzi export onto the
                  page — anywhere on the page. A drop overlay appears while a
                  file is hovering. There is no upload button: drag-and-drop is
                  the only entry point.
                </p>
                <ul className='list-disc pl-5 space-y-1 text-sm text-stone-600 leading-relaxed'>
                  <li>
                    A single-collection file becomes a{' '}
                    <strong>new collection</strong> in your workspace, named to
                    avoid collisions (the importer suffixes &quot;
                    <em>(imported)</em>&quot; if a name is already taken).
                  </li>
                  <li>
                    A library file <strong>restores every collection</strong>{' '}
                    it contains, in one go. Import is atomic: if your remaining
                    slot count (20 max) can&apos;t fit the whole library,
                    nothing is created and you&apos;re told how many slots to
                    free first.
                  </li>
                </ul>
                <p className='text-xs text-stone-500 mt-2'>
                  Imports never touch your existing collections — they only add
                  new ones, and switch you to the first imported collection so
                  you can see the result immediately.
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  What&apos;s in the file
                </h3>
                <p className='text-sm text-stone-700 leading-relaxed'>
                  Both formats are plain JSON, version-tagged, and contain the
                  paper IDs, titles, authors, your groups, and your per-paper
                  notes & keywords. They do <em>not</em> contain abstracts,
                  citation counts, or other freshly-fetched OpenAlex metadata
                  — those are pulled live when the import lands so the
                  recipient sees up-to-date numbers. Files are safe to read,
                  edit, and version-control.
                </p>
              </div>
            </div>
          </section>

          {/* Contributing back to OpenAlex */}
          <section id='contribute'>
            <div className='flex items-center gap-2 mb-4'>
              <Flag size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Help improve the data (OpenAlex)
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-4'>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Paperazzi runs on{' '}
                <a
                  href='https://openalex.org/'
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                >
                  OpenAlex
                </a>
                , an open, non-profit catalog of scholarly works. Like every
                large database, it has rough edges — missing PDFs, garbled
                titles, misattributed authors, off citation counts. Reporting
                them takes seconds and benefits every researcher who uses
                OpenAlex (which is rapidly becoming most of them).
              </p>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2 inline-flex items-center gap-1.5'>
                  <Flag size={14} className='text-stone-500' />
                  How to report a paper error
                </h3>
                <ol className='space-y-2 text-sm text-stone-700 leading-relaxed list-decimal pl-5'>
                  <li>
                    On any paper card, click the small{' '}
                    <strong>flag icon</strong> in the bottom-right corner.
                    A short panel slides open with the paper&apos;s OpenAlex ID
                    and a copy button.
                  </li>
                  <li>
                    Click <strong>Submit correction</strong>. A short Google
                    Form opens in a new tab — paste the ID, describe what&apos;s
                    wrong, submit. Reports are forwarded to OpenAlex.
                  </li>
                  <li>
                    Optional: click <strong>Mark as reported</strong> so you
                    won&apos;t flag the same paper twice. The flag stays in
                    your browser and shows up next time you see that paper.
                  </li>
                </ol>
                <div className='mt-3 flex flex-wrap gap-3 text-sm'>
                  <a
                    href={PAPER_CORRECTION_FORM_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900 underline underline-offset-2'
                  >
                    <Flag size={12} />
                    Paper correction form →
                  </a>
                  <a
                    href={AUTHOR_CORRECTION_FORM_URL}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='inline-flex items-center gap-1.5 text-stone-700 hover:text-stone-900 underline underline-offset-2'
                  >
                    <Flag size={12} />
                    Author correction form →
                  </a>
                </div>
              </div>

              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-2'>
                  What&apos;s worth reporting
                </h3>
                <ul className='list-disc pl-5 space-y-1 text-sm text-stone-600 leading-relaxed'>
                  <li>
                    Wrong or duplicate <strong>authors</strong>, missing
                    affiliations, broken ORCID links.
                  </li>
                  <li>
                    Garbled or truncated <strong>titles</strong> (HTML
                    artefacts, encoding issues).
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
                    Off <strong>citation counts</strong> or wrong reference
                    list.
                  </li>
                  <li>
                    The whole paper is missing from OpenAlex — they&apos;re
                    actively expanding coverage.
                  </li>
                </ul>
              </div>

              <p className='text-xs text-stone-500'>
                For the full background and OpenAlex&apos;s preferred
                workflow,{' '}
                <a
                  href={OPENALEX_FIX_ERRORS_URL}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
                >
                  see their docs
                </a>
                . Contributing to OpenAlex helps build open infrastructure for
                academic research — and reduces our collective reliance on
                closed-source databases.
              </p>
            </div>
          </section>

          {/* Erasing data */}
          <section id='data'>
            <div className='flex items-center gap-2 mb-4'>
              <Database size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Inspecting & erasing your data
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app'>
              <p className='text-sm text-stone-700 leading-relaxed mb-3'>
                Everything Paperazzi stores lives in your browser&apos;s
                localStorage. The <strong>database icon in the navbar</strong>{' '}
                opens a panel listing your saved searches, saved journal
                filters, pinned papers, groups, reported flags, and UI
                preferences.
              </p>
              <p className='text-sm text-stone-700 leading-relaxed'>
                Erase individual items via the panel that owns them (Filters,
                Pinned papers). Erase everything in one click via the red button
                in the database panel — the page reloads afterwards so all
                in-memory state matches.
              </p>
            </div>
          </section>

          {/* Tips */}
          <section id='tips'>
            <div className='flex items-center gap-2 mb-4'>
              <Lightbulb size={18} className='text-stone-400' />
              <h2 className='text-sm font-semibold text-stone-900 uppercase tracking-wide'>
                Workflow examples & tips
              </h2>
            </div>
            <div className='pl-6 border-l-2 border-app space-y-4'>
              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-1'>
                  Mapping a paper&apos;s research path
                </h3>
                <p className='text-sm text-stone-700 leading-relaxed'>
                  Start from a paper you are interested in. Click{' '}
                  <em>see network</em>. Set Journals to <em>Wide → 1</em> to
                  focus on the the canonical outlets. Click the focal paper,
                  then click each ref or cite to trace a path. Pin the papers
                  you find relevant for your literature review — they become a
                  curated reading list.
                </p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-stone-900 mb-1'>
                  Monitoring a journal or journals (by keyword, author, or
                  institution)
                </h3>
                <p className='text-sm text-stone-700 leading-relaxed'>
                  Switch Journals to <em>Specific</em> and pick the journal(s).
                  Set Sort to <em>Most Recent</em>. Set the date range to the
                  last month. Save it as a journal filter so you can run it with
                  one click in future. You can also add a search query and save
                  this search to rerun it quickly next time. Note that you can
                  also to that for institutions or authors.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className='mt-16 pt-8 border-t border-app text-center'>
          <p className='text-sm text-stone-500 mb-2'>
            Stuck or curious? See{' '}
            <a
              href='/about'
              className='text-stone-700 hover:text-stone-900 underline underline-offset-2'
            >
              About
            </a>{' '}
            for the philosophy and comparisons with other tools.
          </p>
        </div>
      </div>
    </main>
  );
}
