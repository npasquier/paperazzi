'use client';
import { useMemo, useRef, useState } from 'react';
import { Paper } from '@/types/interfaces';
import { Maximize2, Plus, Minus, ExternalLink } from 'lucide-react';
import PinButton from './PinButton';

export type NodeRole = 'focal' | 'ref' | 'cite';

interface Props {
  focal: Paper;
  refs: Paper[]; // papers the focal cites
  cites: Paper[]; // papers that cite the focal
}

// SVG user-space dimensions. viewBox scales to container width via w-full.
const W = 1400;
const H = 640;
const PAD = { top: 18, right: 24, bottom: 40, left: 56 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;

// Pan/zoom limits.
const MIN_K = 0.5;
const MAX_K = 8;
// Wheel zoom uses an exponential factor proportional to deltaY so it feels
// smooth on trackpads (small deltaY) and snappy on mouse wheels (large
// deltaY). Tuning constant: ~0.001 makes one mouse-wheel tick (~100px) zoom
// by ~10%, while a trackpad scroll (deltaY≈3) only zooms by ~0.3% per event.
const WHEEL_ZOOM_RATE = 0.0012;
// Step size for explicit +/- buttons.
const BUTTON_ZOOM_FACTOR = 1.3;

function normalizeId(id: string): string {
  return id.replace('https://openalex.org/', '');
}

function paperLink(p: Paper): string {
  if (p.doi) {
    return p.doi.startsWith('http') ? p.doi : `https://doi.org/${p.doi}`;
  }
  return `https://openalex.org/${normalizeId(p.id)}`;
}

// "Smith 2020" — short ResearchRabbit-style label.
function shortLabel(p: Paper): string {
  const authors = p.authors || [];
  const first = authors[0] || '';
  const lastName = first.includes(',')
    ? first.split(',')[0].trim()
    : (first.split(/\s+/).pop() || '').trim();
  const year = p.publication_year ? String(p.publication_year) : '';
  if (!lastName && !year) return '';
  if (!lastName) return year;
  if (!year) return lastName;
  return `${lastName} ${year}`;
}

interface NodeView {
  paper: Paper;
  role: NodeRole;
  cx: number; // base coordinate in chart space (pre-zoom)
  cy: number;
}

interface Transform {
  tx: number;
  ty: number;
  k: number;
}

const IDENTITY: Transform = { tx: 0, ty: 0, k: 1 };

export default function CitationsNetwork({ focal, refs, cites }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Pinned nodes — multi-select. Click toggles membership. Persists after
  // mouse leaves so users can chain clicks to trace a citation path.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [transform, setTransform] = useState<Transform>(IDENTITY);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    startClientX: number;
    startClientY: number;
    startTx: number;
    startTy: number;
    moved: boolean; // tracks whether the gesture was a drag vs a click
  } | null>(null);
  // Brief grace timer so the tooltip survives the gap between leaving a
  // node and entering the tooltip card.
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelHoverClear = () => {
    if (hoverClearTimerRef.current) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  };
  const scheduleHoverClear = (id: string) => {
    cancelHoverClear();
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredId((prev) => (prev === id ? null : prev));
      hoverClearTimerRef.current = null;
    }, 150);
  };
  // Used when the cursor leaves the SVG entirely — we don't know which node
  // (if any) was hovered, so clear unconditionally after the same grace
  // window. Cancelled if the cursor lands on the tooltip card.
  const scheduleHoverClearAny = () => {
    cancelHoverClear();
    hoverClearTimerRef.current = setTimeout(() => {
      setHoveredId(null);
      hoverClearTimerRef.current = null;
    }, 150);
  };

  // ── Build scales, nodes, edges ──────────────────────────────────────
  const built = useMemo(() => {
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

    const withYears = allPapers.filter(
      ({ paper }) => typeof paper.publication_year === 'number',
    );
    const years = withYears.map((n) => n.paper.publication_year);
    const minYear = years.length ? Math.min(...years) : 2000;
    const maxYear = years.length ? Math.max(...years) : 2025;
    const xMin = minYear - 0.5;
    const xMax = maxYear + 0.5;
    const xSpan = Math.max(1, xMax - xMin);

    const cs = withYears.map((n) => Math.max(0, n.paper.cited_by_count || 0));
    const maxCites = cs.length ? Math.max(...cs) : 1;
    const logMaxY = Math.max(1, Math.log10(maxCites + 1));

    const xScale = (year: number): number =>
      PAD.left + ((year - xMin) / xSpan) * INNER_W;
    const yScale = (c: number): number =>
      PAD.top + INNER_H - (Math.log10(c + 1) / logMaxY) * INNER_H;

    const nodes: NodeView[] = allPapers.map(({ paper, role }) => ({
      paper,
      role,
      cx: xScale(paper.publication_year),
      cy: yScale(Math.max(0, paper.cited_by_count || 0)),
    }));

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
      if (n.role === 'cite') pushEdge(normalizeId(n.paper.id), focalId, 'focal');
    }
    for (const n of nodes) {
      if (n.role === 'focal') continue;
      const fromId = normalizeId(n.paper.id);
      const refsList = n.paper.referenced_works || [];
      for (const rawTo of refsList) {
        const toId = normalizeId(rawTo);
        if (idToNode.has(toId)) {
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

    return { nodes, edges, idToNode, xScale, yScale, yTicks, xTicks, minYear, maxYear };
  }, [focal, refs, cites]);

  if (built.nodes.length <= 1) {
    return (
      <div className='surface-card border border-app rounded p-6 text-center text-sm text-stone-500'>
        Not enough papers with publication years to plot a network.
      </div>
    );
  }

  // ── Transform helpers (chart coords → screen coords) ────────────────
  const screenX = (cx: number) => cx * transform.k + transform.tx;
  const screenY = (cy: number) => cy * transform.k + transform.ty;

  // ── Pan/zoom event handlers ─────────────────────────────────────────
  const toViewBox = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  };

  // Apply a zoom factor centered on a given viewBox-space point. Used by
  // both the wheel handler and the +/− buttons.
  const zoomAt = (factor: number, cx: number, cy: number) => {
    setTransform((prev) => {
      const targetK = Math.max(MIN_K, Math.min(MAX_K, prev.k * factor));
      const realFactor = targetK / prev.k;
      return {
        k: targetK,
        tx: cx - (cx - prev.tx) * realFactor,
        ty: cy - (cy - prev.ty) * realFactor,
      };
    });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.stopPropagation();
    const { x, y } = toViewBox(e.clientX, e.clientY);
    // deltaY-proportional exponential factor: smooth on trackpads, snappy
    // on mouse wheels. Negative deltaY (scrolling up) → factor > 1 (zoom in).
    const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_RATE);
    zoomAt(factor, x, y);
  };

  // Centered-on-viewport zoom for +/− buttons.
  const zoomCenter = (factor: number) => {
    zoomAt(factor, W / 2, H / 2);
  };

  const startPan = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTx: transform.tx,
      startTy: transform.ty,
      moved: false,
    };
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const movePan = (e: React.PointerEvent<SVGRectElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = ((e.clientX - drag.startClientX) / rect.width) * W;
    const dy = ((e.clientY - drag.startClientY) / rect.height) * H;
    // Threshold to distinguish a click from a drag (in viewBox units).
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.moved = true;
    }
    // Capture into locals so the updater doesn't crash if endPan nulls the
    // ref between this scheduling call and the deferred state apply (React
    // 19 strict mode also double-invokes updaters).
    const startTx = drag.startTx;
    const startTy = drag.startTy;
    setTransform((t) => ({
      ...t,
      tx: startTx + dx,
      ty: startTy + dy,
    }));
  };

  const endPan = (e: React.PointerEvent<SVGRectElement>) => {
    if (!dragRef.current) return;
    // Pinned nodes are no longer cleared by clicking empty chart area —
    // only the legend's "Clear" chip does that. Empty-area clicks are a
    // no-op so users can pan without losing their path.
    dragRef.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // pointer may already have been released
    }
  };

  // ── Active-state edge filter ────────────────────────────────────────
  // Active set = pinned (selectedIds) ∪ current hover. Hover ADDS to the
  // highlight rather than overriding it, so chaining clicks builds up a
  // visible path without losing earlier pins.
  const activeSet = new Set<string>(selectedIds);
  if (hoveredId) activeSet.add(hoveredId);
  const anyActive = activeSet.size > 0;

  // Tooltip is driven solely by hover. If the hovered node is also pinned,
  // the tooltip becomes interactive (Pin/Open/Unpin); otherwise it's a
  // transient preview.
  const hoveredNode = hoveredId
    ? built.nodes.find((n) => normalizeId(n.paper.id) === hoveredId) || null
    : null;
  const hoveredIsPinned = !!hoveredId && selectedIds.has(hoveredId);

  const isZoomed =
    transform.k !== 1 || transform.tx !== 0 || transform.ty !== 0;

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className='surface-card border border-app rounded p-3'>
      <div className='flex items-center gap-3 text-[10px] text-app-muted mb-2'>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2.5 h-2.5 rounded-full bg-[var(--warning-foreground)]' />
          Focal paper
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2 h-2 rounded-full bg-[var(--graph-reference)]' />
          References ({refs.length})
        </span>
        <span className='inline-flex items-center gap-1.5'>
          <span className='inline-block w-2 h-2 rounded-full bg-[var(--graph-citing)]' />
          Citing papers ({cites.length})
        </span>
        <span className='inline-flex items-center gap-1.5 ml-auto'>
          {built.edges.length} edge{built.edges.length === 1 ? '' : 's'}
        </span>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className='inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-[var(--warning-bg)] text-warning hover:bg-[#f5e2bb] rounded transition'
            title='Clear pinned nodes'
          >
            {selectedIds.size} pinned · Clear
          </button>
        )}
        <div className='inline-flex items-center gap-1'>
          <button
            onClick={() => zoomCenter(1 / BUTTON_ZOOM_FACTOR)}
            disabled={transform.k <= MIN_K + 1e-6}
            className='p-1 text-app-muted surface-muted hover:bg-[var(--surface-subtle)] rounded transition disabled:opacity-40 disabled:cursor-not-allowed'
            title='Zoom out'
            aria-label='Zoom out'
          >
            <Minus size={11} />
          </button>
          <span className='text-[10px] text-app-soft tabular-nums w-9 text-center'>
            {Math.round(transform.k * 100)}%
          </span>
          <button
            onClick={() => zoomCenter(BUTTON_ZOOM_FACTOR)}
            disabled={transform.k >= MAX_K - 1e-6}
            className='p-1 text-app-muted surface-muted hover:bg-[var(--surface-subtle)] rounded transition disabled:opacity-40 disabled:cursor-not-allowed'
            title='Zoom in'
            aria-label='Zoom in'
          >
            <Plus size={11} />
          </button>
          {isZoomed && (
            <button
              onClick={() => setTransform(IDENTITY)}
              className='inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-app-muted surface-muted hover:bg-[var(--surface-subtle)] rounded transition ml-1'
              title='Reset view'
            >
              <Maximize2 size={10} /> Reset
            </button>
          )}
        </div>
      </div>

      <div className='relative w-full'>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className='w-full h-auto select-none'
          style={{
            cursor: dragRef.current ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          // Defer the clear so the tooltip card (a sibling of this SVG) has
          // time to capture the cursor and cancel the timer.
          onMouseLeave={scheduleHoverClearAny}
          onWheel={handleWheel}
        >
          <defs>
            {/* Clip the data layer to the chart area so panned content
                doesn't bleed onto the axis labels. */}
            <clipPath id='chart-clip'>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={INNER_W}
                height={INNER_H}
              />
            </clipPath>
            {/* Subtle axis-end arrowheads */}
            <marker
              id='axis-arrow'
              viewBox='0 0 10 10'
              refX='9'
              refY='5'
              markerWidth='6'
              markerHeight='6'
              orient='auto-start-reverse'
            >
              <path d='M 0 0 L 10 5 L 0 10 z' fill='var(--border-strong)' />
            </marker>
          </defs>

          {/* Pan surface — invisible rect that captures drag gestures.
              Sits BEHIND nodes so node clicks/hover still work. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={INNER_W}
            height={INNER_H}
            fill='transparent'
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
          />

          {/* Sober axes — short arrows at the bottom-left with the axis
              label sitting inline:  ── Year ──>  */}
          {(() => {
            const ox = PAD.left + 6;
            const oy = H - PAD.bottom - 6;
            const xLen = 90;
            const yLen = 110;
            // Text gets a white stroke halo (paintOrder='stroke') so the
            // line beneath visually breaks around the characters.
            return (
              <g>
                {/* Y axis: vertical line + 'Citations' label rotated 90° */}
                <line
                  x1={ox}
                  y1={oy}
                  x2={ox}
                  y2={oy - yLen}
                  stroke='var(--border-strong)'
                  strokeWidth={1}
                  markerEnd='url(#axis-arrow)'
                />
                <text
                  x={ox}
                  y={oy - yLen / 2}
                  fontSize='10'
                  fill='var(--foreground-muted)'
                  textAnchor='middle'
                  stroke='var(--background-card)'
                  strokeWidth={3}
                  paintOrder='stroke'
                  transform={`rotate(-90 ${ox} ${oy - yLen / 2})`}
                >
                  Citations
                </text>

                {/* X axis: horizontal line + 'Year' label inline */}
                <line
                  x1={ox}
                  y1={oy}
                  x2={ox + xLen}
                  y2={oy}
                  stroke='var(--border-strong)'
                  strokeWidth={1}
                  markerEnd='url(#axis-arrow)'
                />
                <text
                  x={ox + xLen / 2}
                  y={oy + 3}
                  fontSize='10'
                  fill='var(--foreground-muted)'
                  textAnchor='middle'
                  stroke='var(--background-card)'
                  strokeWidth={3}
                  paintOrder='stroke'
                >
                  Year
                </text>
              </g>
            );
          })()}

          {/* Data layer — clipped so it doesn't render outside the chart area.
              All elements use screen coordinates (already transformed) so
              dot radii / stroke widths / font sizes stay constant under zoom. */}
          <g clipPath='url(#chart-clip)'>
            {/* Edges */}
            {built.edges.map((e) => {
              const a = built.idToNode.get(e.fromId);
              const b = built.idToNode.get(e.toId);
              if (!a || !b) return null;
              // Edge highlight semantics:
              //   • backward/reference link — active node cites the other node
              //   • forward/citing link     — the other node cites the active node
              //   • none                    — no active endpoints; if any node
              //                               is active, dim the rest
              const fromActive = activeSet.has(e.fromId);
              const toActive = activeSet.has(e.toId);
              const isHighlighted = fromActive || toActive;
              const dimmed = anyActive && !isHighlighted;
              const hoveredBackward = hoveredId === e.fromId;
              const hoveredForward = hoveredId === e.toId;
              const stroke =
                hoveredBackward
                  ? 'var(--graph-reference)'
                  : hoveredForward
                    ? 'var(--graph-citing)'
                    : fromActive
                      ? 'var(--graph-reference)'
                      : toActive
                        ? 'var(--graph-citing)'
                        : 'var(--border-muted)';
              const opacity = dimmed
                ? 0.15
                : fromActive && toActive
                  ? 0.95
                  : isHighlighted
                    ? 0.9
                    : 0.5;
              const width = fromActive && toActive ? 1.6 : isHighlighted ? 1.4 : 0.8;
              return (
                <line
                  key={`${e.fromId}->${e.toId}`}
                  x1={screenX(a.cx)}
                  y1={screenY(a.cy)}
                  x2={screenX(b.cx)}
                  y2={screenY(b.cy)}
                  stroke={stroke}
                  strokeWidth={width}
                  strokeOpacity={opacity}
                  style={{
                    transition:
                      'stroke 180ms ease, stroke-opacity 180ms ease, stroke-width 150ms ease',
                  }}
                />
              );
            })}

            {/* Nodes */}
            {built.nodes.map((n) => {
              const id = normalizeId(n.paper.id);
              const isActive = activeSet.has(id);
              const isPinned = selectedIds.has(id);
              const isFocal = n.role === 'focal';
              const fill = isFocal
                ? 'var(--warning-foreground)'
                : n.role === 'ref'
                  ? 'var(--graph-reference)'
                  : 'var(--graph-citing)';
              const r = isFocal ? (isActive ? 11 : 9) : isActive ? 6 : 4.5;
              return (
                <g
                  key={id || `${n.paper.publication_year}-${n.paper.title}`}
                >
                  {/* Pinned ring — drawn behind the dot for every pinned node */}
                  {isPinned && (
                    <circle
                      cx={screenX(n.cx)}
                      cy={screenY(n.cy)}
                      r={r + 4}
                      fill='none'
                      stroke={fill}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                      pointerEvents='none'
                    />
                  )}
                  <circle
                    cx={screenX(n.cx)}
                    cy={screenY(n.cy)}
                    r={r}
                    fill={fill}
                    stroke={isFocal ? 'var(--warning-foreground)' : 'var(--background-card)'}
                    strokeWidth={isFocal ? 1.5 : 0.8}
                    fillOpacity={anyActive && !isActive && !isFocal ? 0.45 : 1}
                    className='cursor-pointer'
                    style={{
                      transition:
                        'fill-opacity 180ms ease, r 150ms ease, stroke-opacity 180ms ease',
                    }}
                    onMouseEnter={() => {
                      cancelHoverClear();
                      setHoveredId(id);
                    }}
                    // Schedule a clear with a small delay; if the cursor lands
                    // on the tooltip card (or another circle) within that
                    // window, the timer is cancelled.
                    onMouseLeave={() => scheduleHoverClear(id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Toggle pinned membership. Clicking a pinned node
                      // releases that one; clicking an unpinned node adds
                      // it to the active set (cumulative — chain clicks to
                      // trace a citation path).
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(id)) next.delete(id);
                        else next.add(id);
                        return next;
                      });
                    }}
                  />
                </g>
              );
            })}

            {/* Per-node short labels (FirstAuthor YYYY) for non-focal nodes */}
            <g pointerEvents='none'>
              {built.nodes.map((n) => {
                if (n.role === 'focal') return null;
                const id = normalizeId(n.paper.id);
                const isActive = activeSet.has(id);
                const isDimmed = anyActive && !isActive;
                const label = shortLabel(n.paper);
                if (!label) return null;
                return (
                  <text
                    key={`lbl-${id}`}
                    x={screenX(n.cx) + 6}
                    y={screenY(n.cy) + 3}
                    fontSize={isActive ? 11 : 9}
                    fontWeight={isActive ? 600 : 400}
                    fill={isActive ? 'var(--foreground)' : 'var(--foreground-muted)'}
                    fillOpacity={isDimmed ? 0.25 : isActive ? 1 : 0.7}
                    stroke='var(--background-card)'
                    strokeWidth={3}
                    paintOrder='stroke'
                    strokeOpacity={isDimmed ? 0.4 : 0.9}
                    style={{
                      transition:
                        'fill-opacity 180ms ease, stroke-opacity 180ms ease, font-size 150ms ease',
                    }}
                  >
                    {label}
                  </text>
                );
              })}
            </g>

            {/* Focal label — same FirstAuthor YYYY format as other nodes,
                slightly larger and amber so it stands out without the title. */}
            {(() => {
              const focalNode = built.nodes.find((n) => n.role === 'focal');
              if (!focalNode) return null;
              const label = shortLabel(focalNode.paper);
              if (!label) return null;
              return (
                <text
                  x={screenX(focalNode.cx) + 8}
                  y={screenY(focalNode.cy) + 3}
                  fontSize='11'
                  fill='var(--warning-foreground)'
                  fontWeight='700'
                  stroke='var(--background-card)'
                  strokeWidth={3}
                  paintOrder='stroke'
                  pointerEvents='none'
                >
                  {label}
                </text>
              );
            })()}
          </g>
        </svg>

        {/* Tooltip — kept alive while the cursor is over the card itself, so
            users can move from node into the card and click Pin/Open. */}
        {hoveredNode && (
          <div
            className='absolute pointer-events-auto surface-card border border-app rounded shadow-md p-2.5 max-w-xs text-xs'
            style={{
              left: `${(screenX(hoveredNode.cx) / W) * 100}%`,
              top: `${(screenY(hoveredNode.cy) / H) * 100}%`,
              transform: 'translate(12px, -50%)',
            }}
            onMouseEnter={cancelHoverClear}
            onMouseLeave={() => scheduleHoverClear(normalizeId(hoveredNode.paper.id))}
            onPointerDown={(e) => e.stopPropagation()}
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
            <div className='flex items-center gap-2 mt-2 pt-2 border-t border-app-muted'>
              <PinButton paper={hoveredNode.paper} size='sm' />
              <a
                href={paperLink(hoveredNode.paper)}
                target='_blank'
                rel='noopener noreferrer'
                className='inline-flex items-center gap-1 px-2 py-1 text-[11px] button-secondary rounded transition'
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={11} /> Open
              </a>
              {hoveredIsPinned && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      next.delete(normalizeId(hoveredNode.paper.id));
                      return next;
                    });
                  }}
                  className='ml-auto text-[10px] text-app-soft hover:text-app-muted transition'
                  title='Remove this node from the highlighted path'
                >
                  Unpin links
                </button>
              )}
            </div>
            {!hoveredIsPinned && (
              <p className='text-[10px] text-app-soft mt-1'>
                Click the node to pin its links and add to the path
              </p>
            )}
          </div>
        )}
      </div>

      <p className='text-[10px] text-app-soft mt-1'>
        Drag to pan · Scroll to zoom · Click nodes to pin their links — keep
        clicking to trace a path. Reference links stay green and citing links
        stay blue when highlighted. Use the Clear chip to reset.
      </p>
    </div>
  );
}
