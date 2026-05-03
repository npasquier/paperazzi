import {
  Compass,
  Filter,
  Bookmark,
  Network,
  Pin,
  Database,
  Lightbulb,
} from 'lucide-react';

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
                (right sidebar). The cap is 30 pinned papers.
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
                (delete, move). Each pinned card exposes quick actions for{' '}
                <em>cites · refs · network · details · pdf</em> — the details
                button opens the paper abstract and external links, while
                clicking <em>network</em> still takes you straight to that
                paper&apos;s citation map.
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
