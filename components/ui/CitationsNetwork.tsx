'use client';
import { useMemo, useState } from 'react';
import { Paper } from '@/types/interfaces';

export type NodeRole = 'focal' | 'ref' | 'cite';

interface Props {
  focal: Paper;
  refs: Paper[]; // papers the focal cites
  cites: Paper[]; // papers that cite the focal
}

// Layout constants (SVG user-space units; viewBox scales to container width).
const W = 1100;
const H = 640;
const PAD = { top: 18, right: 24, bottom: 40, left: 56 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

// "Smith 2020" — short ResearchRabbit-style label.
function shortLabel(p: Paper): string {
  const authors = p.authors || [];
  const first = authors[0] || '';
  // "Last, First" → "Last"; otherwise take last word.
  const lastName = first.includes(',')
    ? first.split(',')[0].trim()
    : (first.split(/\s+/).pop() || '').trim();
  const year = p.publication_year ? String(p.publication_year) : '';
  if (!lastName && !year) return '';
  if (!lastName) return year;
  if (!year) return lastName;
  return `${lastName} ${year}`;
}

function normalizeId(id: string): string {
  return id.replace('https://openalex.org/', '');
}

function paperLink(p: Paper): string {
  if (p.doi) {
    return p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`;
  }
  return `https://openalex.org/${normalizeId(p.id)}`;
}

interface NodeView {
  paper: Paper;
  role: NodeRole;
  cx: number;
  cy: number;
}

export default function CitationsNetwork({ focal, refs, cites }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // ── Build node set, scales, and edges ────────────────────────────────
  const { nodes, edges, yTicks, xTicks } = useMemo(() => {
    // De-duplicate (a paper might appear in both refs and cites; rare but
    // possible if focal cites it AND it cites focal — keep only one node and
    // mark it as ref).
    const seen = new Set<string>([normalizeId(focal.id)]);
    const refNodes = refs
      .filter((p) => {
        const id = normalizeId(p.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .filter((p) => typeof p.publication_year === 'number');
    const citeNodes = cites
      .filter((p) => {
        const id = normalizeId(p.id);
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .filter((p) => typeof p.publication_year === 'number');

    const allPapers: { paper: Paper; role: NodeRole }[] = [
      { paper: focal, role: 'focal' },
      ...refNodes.map((p) => ({ paper: p, role: 'ref' as NodeRole })),
      ...citeNodes.map((p) => ({ paper: p, role: 'cite' as NodeRole })),
    ];

    // Year + citation domain over everything that has data.
    const withYears = allPapers.filter(
      ({ paper }) => typeof paper.publication_year === 'number',
    );
    const years = withYears.map((n) => n.paper.publication_year);
    const minYear = years.length ? Math.min(...years) : 2000;
    const maxYear = years.length ? Math.max(...years) : 2025;
    const xMin = minYear - 0.5;
    const xMax = maxYear + 0.5;
    const xSpan = Math.max(1, xMax - xMin);

    const cs = withYears.map((n) =>
      Math.max(0, n.paper.cited_by_count || 0),
    );
    const maxCites = cs.length ? Math.max(...cs) : 1;
    const logMaxY = Math.max(1, Math.log10(maxCites + 1));

    const xScale = (year: number) =>
      PAD.left + ((year - xMin) / xSpan) * INNER_W;
    const yScale = (c: number) =>
      PAD.top + INNER_H - (Math.log10(c + 1) / logMaxY) * INNER_H;

    const nodes: NodeView[] = allPapers.map(({ paper, role }) => ({
      paper,
      role,
      cx: xScale(paper.publication_year),
      cy: yScale(Math.max(0, paper.cited_by_count || 0)),
    }));

    // Edge computation — a→b means "a cites b". Sources:
    //   • focal → each ref         (definitional)
    //   • each cite → focal        (definitional)
    //   • for any non-focal X with referenced_works set, an edge X→Y for each
    //     Y in the visualised set whose normalised id is in X.referenced_works.
    //     This catches cite→ref and cite→cite edges that aren't implicit.
    const idToNode = new Map<string, NodeView>();
    for (const n of nodes) idToNode.set(normalizeId(n.paper.id), n);

    type Edge = { fromId: string; toId: string; kind: 'focal' | 'between' };
    const edgeSet = new Set<string>();
    const edges: Edge[] = [];
    const focalId = normalizeId(focal.id);

    const pushEdge = (from: string, to: string, kind: Edge['kind']) => {
      if (from === to) return;
      const key = `${from}->${to}`;
      if (edgeSet.has(key)) return;
      edgeSet.add(key);
      edges.push({ fromId: from, toId: to, kind });
    };

    for (const n of nodes) {
      if (n.role === 'ref') pushEdge(focalId, normalizeId(n.paper.id), 'focal');
      if (n.role === 'cite')
        pushEdge(normalizeId(n.paper.id), focalId, 'focal');
    }
    for (const n of nodes) {
      if (n.role === 'focal') continue; // focal's references are implicit above
      const fromId = normalizeId(n.paper.id);
      const refsList = n.paper.referenced_works || [];
      for (const rawTo of refsList) {
        const toId = normalizeId(rawTo);
        if (idToNode.has(toId)) {
          // Skip the implicit cite→focal which we already added.
          if (toId === focalId) continue;
          pushEdge(fromId, toId, 'between');
        }
      }
    }

    // Y-axis ticks at log decades.
    const yTicks: number[] = [];
    for (let exp = 0; Math.pow(10, exp) <= Math.max(1, maxCites); exp++) {
      yTicks.push(Math.pow(10, exp));
    }
    if (yTicks[yTicks.length - 1] < maxCites) yTicks.push(maxCites);

    // X-axis ticks: aim for ~6–10 labels.
    const yearStep = Math.max(1, Math.ceil((maxYear - minYear + 1) / 8));
    const xTicks: number[] = [];
    for (let y = minYear; y <= maxYear; y += yearStep) xTicks.push(y);
    if (xTicks[xTicks.length - 1] !== maxYear) xTicks.push(maxYear);

    return { nodes, edges, yTicks, xTicks };
  }, [focal, refs, cites]);

  if (nodes.length <= 1) {
    return (
      <div className='border border-stone-200 rounded p-6 text-center text-sm text-stone-500'>
        Not enough papers with publication years to plot a network.
      </div>
    );
  }

  // Lookup helpers used during render.
  const idToNode = new Map<string, NodeView>();
  for (const n of nodes) idToNode.set(normalizeId(n.paper.id), n);

  // Hover-state edge filter: when a node is hovered, only highlight that
  // node's own edges; everything else fades.
  const hoveredEdges = hoveredId
    ? new Set(
        edges
          .filter((e) => e.fromId === hoveredId || e.toId === hoveredId)
          .map((e) => `${e.fromId}->${e.toId}`),
      )
    : null;

  const hoveredNode = hoveredId
    ? nodes.find((n) => normalizeId(n.paper.id) === hoveredId) || null
    : null;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className='border border-stone-200 rounded bg-white p-3'>
      <div className='flex items-center gap-3 text-[10px] text-stone-500 mb-2'>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2.5 h-2.5 rounded-full bg-amber-500' />
          Focal paper
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2 h-2 rounded-full bg-emerald-500' />
          References ({refs.length})
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2 h-2 rounded-full bg-sky-500' />
          Citing papers ({cites.length})
        </span>
        <span className='inline-flex items-center gap-1.5 ml-auto'>
          {edges.length} edge{edges.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className='relative w-full'>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className='w-full h-auto'
          onMouseLeave={() => setHoveredId(null)}
        >
          {/* Y-axis grid + labels */}
          {yTicks.map((t) => {
            // Approximate the actual y for the tick: same scale as nodes.
            // Reuse maxCites by scanning nodes' max cited_by_count.
            // Simpler: derive yScale here using the same xMin/xMax scheme
            // by capturing it. Instead we just reuse the formula via a node
            // — scan nodes for matching tick approximation.
            // Simpler still: compute against the closest node — but that's
            // imprecise. We'll derive by inverting from existing nodes.
            const refNode = nodes.reduce(
              (best, n) =>
                Math.abs((n.paper.cited_by_count || 0) - t) <
                Math.abs((best.paper.cited_by_count || 0) - t)
                  ? n
                  : best,
              nodes[0],
            );
            const y = refNode.cy; // close enough for visual tick guide
            return (
              <g key={`y-${t}`}>
                <line
                  x1={PAD.left}
                  y1={y}
                  x2={W - PAD.right}
                  y2={y}
                  stroke='#e7e5e4'
                  strokeDasharray='2,3'
                />
                <text
                  x={PAD.left - 6}
                  y={y + 3}
                  fontSize='10'
                  fill='#a8a29e'
                  textAnchor='end'
                >
                  {t >= 1000 ? `${Math.round(t / 100) / 10}k` : t}
                </text>
              </g>
            );
          })}

          {/* X-axis line */}
          <line
            x1={PAD.left}
            y1={H - PAD.bottom}
            x2={W - PAD.right}
            y2={H - PAD.bottom}
            stroke='#d6d3d1'
          />
          {/* X-axis labels */}
          {xTicks.map((t) => {
            const refNode = nodes.reduce(
              (best, n) =>
                Math.abs(n.paper.publication_year - t) <
                Math.abs(best.paper.publication_year - t)
                  ? n
                  : best,
              nodes[0],
            );
            const x = refNode.cx;
            return (
              <g key={`x-${t}`}>
                <line
                  x1={x}
                  y1={H - PAD.bottom}
                  x2={x}
                  y2={H - PAD.bottom + 4}
                  stroke='#d6d3d1'
                />
                <text
                  x={x}
                  y={H - PAD.bottom + 16}
                  fontSize='10'
                  fill='#a8a29e'
                  textAnchor='middle'
                >
                  {t}
                </text>
              </g>
            );
          })}

          {/* Axis titles */}
          <text
            x={PAD.left + INNER_W / 2}
            y={H - 6}
            fontSize='11'
            fill='#78716c'
            textAnchor='middle'
          >
            Publication year
          </text>
          <text
            x={14}
            y={PAD.top + INNER_H / 2}
            fontSize='11'
            fill='#78716c'
            textAnchor='middle'
            transform={`rotate(-90 14 ${PAD.top + INNER_H / 2})`}
          >
            Citations (log)
          </text>

          {/* Edges layer (rendered before nodes so dots sit on top) */}
          <g>
            {edges.map((e) => {
              const a = idToNode.get(e.fromId);
              const b = idToNode.get(e.toId);
              if (!a || !b) return null;
              const isHighlighted = hoveredEdges?.has(
                `${e.fromId}->${e.toId}`,
              );
              const dimmed = hoveredEdges && !isHighlighted;
              const stroke =
                isHighlighted && hoveredNode
                  ? // Color by relationship to the hovered node:
                    //   incoming  (someone cites hovered) → sky
                    //   outgoing  (hovered cites someone) → emerald
                    e.toId === normalizeId(hoveredNode.paper.id)
                    ? '#0ea5e9'
                    : '#10b981'
                  : '#d6d3d1';
              const opacity = dimmed ? 0.15 : isHighlighted ? 0.9 : 0.5;
              const width = isHighlighted ? 1.4 : 0.8;
              return (
                <line
                  key={`${e.fromId}->${e.toId}`}
                  x1={a.cx}
                  y1={a.cy}
                  x2={b.cx}
                  y2={b.cy}
                  stroke={stroke}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                />
              );
            })}
          </g>

          {/* Nodes layer */}
          <g>
            {nodes.map((n) => {
              const id = normalizeId(n.paper.id);
              const isHovered = id === hoveredId;
              const isFocal = n.role === 'focal';
              const fill = isFocal
                ? '#f59e0b' // amber-500
                : n.role === 'ref'
                  ? '#10b981' // emerald-500
                  : '#0ea5e9'; // sky-500
              const r = isFocal ? (isHovered ? 11 : 9) : isHovered ? 6 : 4.5;
              return (
                <circle
                  key={id || `${n.paper.publication_year}-${n.paper.title}`}
                  cx={n.cx}
                  cy={n.cy}
                  r={r}
                  fill={fill}
                  stroke={isFocal ? '#92400e' : 'white'}
                  strokeWidth={isFocal ? 1.5 : 0.8}
                  fillOpacity={hoveredId && !isHovered ? 0.45 : 1}
                  className='cursor-pointer transition'
                  onMouseEnter={() => setHoveredId(id)}
                  onClick={() =>
                    window.open(paperLink(n.paper), '_blank', 'noopener')
                  }
                />
              );
            })}
          </g>

          {/* Per-node short labels (FirstAuthor YYYY) for non-focal nodes */}
          <g pointerEvents='none'>
            {nodes.map((n) => {
              if (n.role === 'focal') return null;
              const id = normalizeId(n.paper.id);
              const isHovered = id === hoveredId;
              const isDimmed = !!hoveredId && !isHovered;
              const label = shortLabel(n.paper);
              if (!label) return null;
              return (
                <text
                  key={`lbl-${id}`}
                  x={n.cx + 6}
                  y={n.cy + 3}
                  fontSize={isHovered ? 11 : 9}
                  fontWeight={isHovered ? 600 : 400}
                  fill={isHovered ? '#1c1917' : '#57534e'}
                  fillOpacity={isDimmed ? 0.25 : isHovered ? 1 : 0.7}
                  // Subtle white halo so labels stay legible over edges.
                  stroke='#ffffff'
                  strokeWidth={3}
                  paintOrder='stroke'
                  strokeOpacity={isDimmed ? 0.4 : 0.9}
                >
                  {label}
                </text>
              );
            })}
          </g>

          {/* Focal label — title above the focal node */}
          {(() => {
            const focalNode = nodes.find((n) => n.role === 'focal');
            if (!focalNode) return null;
            const text =
              (focalNode.paper.title || '').slice(0, 60) +
              ((focalNode.paper.title || '').length > 60 ? '…' : '');
            const lx = Math.max(
              PAD.left + 60,
              Math.min(W - PAD.right - 60, focalNode.cx),
            );
            const ly = Math.max(PAD.top + 14, focalNode.cy - 16);
            return (
              <text
                x={lx}
                y={ly}
                fontSize='11'
                fill='#78350f'
                textAnchor='middle'
                fontWeight='700'
                stroke='#ffffff'
                strokeWidth={3}
                paintOrder='stroke'
                pointerEvents='none'
              >
                {text}
              </text>
            );
          })()}
        </svg>

        {/* Tooltip */}
        {hoveredNode && (
          <div
            className='absolute pointer-events-none bg-white border border-stone-200 rounded shadow-md p-2.5 max-w-xs text-xs'
            style={{
              left: `${(hoveredNode.cx / W) * 100}%`,
              top: `${(hoveredNode.cy / H) * 100}%`,
              transform: 'translate(12px, -50%)',
            }}
          >
            <p className='font-medium text-stone-900 line-clamp-2 leading-snug'>
              {hoveredNode.paper.title}
            </p>
            <p className='text-stone-600 mt-1 leading-snug'>
              {hoveredNode.paper.authors?.slice(0, 3).join(', ')}
              {hoveredNode.paper.authors &&
              hoveredNode.paper.authors.length > 3
                ? ' et al.'
                : ''}
              {' · '}
              {hoveredNode.paper.publication_year}
            </p>
            <p className='text-stone-500 mt-0.5'>
              {hoveredNode.paper.cited_by_count?.toLocaleString() || 0} citation
              {hoveredNode.paper.cited_by_count === 1 ? '' : 's'}
            </p>
            <p className='text-[10px] text-stone-400 mt-1'>
              Click dot to open paper
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
